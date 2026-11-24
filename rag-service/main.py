from pathlib import Path
import os
import io
import uuid
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import pymongo
import google.generativeai as genai
import pypdf
import numpy as np

# 1. Resolve and load .env files
service_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=service_dir / ".env")
load_dotenv(dotenv_path=service_dir.parent / "backend" / ".env")
load_dotenv(dotenv_path=service_dir.parent / ".env")
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-service")

# Support both naming conventions: GOOGLE_API_KEY and GEMINI_API_KEY
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
# Support both naming conventions: MONGODB_URI and MONGO_URI
MONGO_URI = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI")

if not GEMINI_API_KEY:
    logger.error("Neither GOOGLE_API_KEY nor GEMINI_API_KEY found in environment or .env file!")
else:
    os.environ["GOOGLE_API_KEY"] = GEMINI_API_KEY
    os.environ["GEMINI_API_KEY"] = GEMINI_API_KEY
    genai.configure(api_key=GEMINI_API_KEY, transport="rest")
    logger.info("Google Gemini API successfully configured with REST transport.")

if not MONGO_URI:
    logger.warning("Neither MONGODB_URI nor MONGO_URI found in environment or .env file.")

# MongoDB Atlas Client
mongo_client = None
chunks_collection = None

if MONGO_URI:
    try:
        mongo_client = pymongo.MongoClient(MONGO_URI)
        db = mongo_client.get_database("eduquery")
        chunks_collection = db.get_collection("chunks")
        logger.info("Successfully connected to MongoDB Atlas.")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB Atlas: {e}")

# In-memory store for instant zero-lag demo fallback
IN_MEMORY_CHUNKS: List[dict] = []

SAMPLE_FALLBACK_DOCS = [
    {
        "documentId": "CSE_Syllabus_2026.pdf",
        "filename": "CSE_Syllabus_2026.pdf",
        "page": 1,
        "text": "Unit 1: Data Structures & Algorithms — AVL Trees, Red-Black Trees, B-Trees, Graphs. AVL tree rotations (LL, RR, LR, RL) take O(1) time; insertion, deletion, and search take O(log n) time.",
        "score": 0.92
    },
    {
        "documentId": "CSE_Syllabus_2026.pdf",
        "filename": "CSE_Syllabus_2026.pdf",
        "page": 2,
        "text": "Unit 2: DBMS — ER Modeling, Normalization (1NF, 2NF, 3NF, BCNF), SQL, Transactions, ACID properties, Concurrency Control, and Indexing.",
        "score": 0.89
    },
    {
        "documentId": "CSE_Syllabus_2026.pdf",
        "filename": "CSE_Syllabus_2026.pdf",
        "page": 3,
        "text": "Unit 3: Operating Systems & Computer Networks — CPU Scheduling, Deadlocks, Paging, Virtual Memory, OSI Model, TCP/IP, HTTP, and Routing.",
        "score": 0.87
    }
]

def load_existing_chunks_into_memory():
    """Preload persisted chunks into memory on startup so cosine search works immediately."""
    global IN_MEMORY_CHUNKS
    if chunks_collection is not None:
        try:
            stored = list(chunks_collection.find({}, {"_id": 0}))
            if stored:
                IN_MEMORY_CHUNKS.extend(stored)
                logger.info(f"Loaded {len(stored)} existing chunks into memory store.")
        except Exception as e:
            logger.warning(f"Could not preload chunks into memory: {e}")

# FastAPI App
app = FastAPI(
    title="EduQuery AI - Academic RAG Microservice",
    description="Vector search & grounded generation via MongoDB Atlas and Gemini API",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    load_existing_chunks_into_memory()


class RetrieveAndGenerateRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5


class SourceItem(BaseModel):
    document_id: Optional[str] = None
    filename: Optional[str] = None
    page: Optional[int] = None
    snippet: str
    score: Optional[float] = None


class RetrieveAndGenerateResponse(BaseModel):
    answer: str
    sources: List[SourceItem]


class DocumentSummary(BaseModel):
    documentId: str
    filename: str
    chunkCount: int
    uploadedAt: Optional[str] = None


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 100) -> List[str]:
    """Splits text into overlapping chunks of ~500-800 characters with 100-character overlap."""
    if not text:
        return []
    chunks = []
    start = 0
    text_len = len(text)
    while start < text_len:
        end = min(start + chunk_size, text_len)
        if end < text_len:
            # Find closest sentence or whitespace boundary to avoid cut-off words
            break_point = max(
                text.rfind(".\n", start, end),
                text.rfind(". ", start, end),
                text.rfind("\n", start, end),
                text.rfind(" ", start, end),
            )
            if break_point > start + 250:
                end = break_point + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= text_len:
            break
        start = max(end - overlap, start + 1)
    return chunks


def embed_text(text: str, task_type: str = "retrieval_query") -> List[float]:
    """Generate 3072-dim vector embedding using Gemini models/gemini-embedding-001."""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key is not configured. Please set GOOGLE_API_KEY in .env",
        )
    try:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text,
            task_type=task_type,
        )
        return result["embedding"]
    except Exception as e:
        logger.error(f"Gemini embedding error: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes cosine similarity between two float vectors."""
    try:
        a = np.array(v1, dtype=np.float32)
        b = np.array(v2, dtype=np.float32)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))
    except Exception:
        return 0.0


def retrieve_relevant_chunks(query_vector: List[float], top_k: int = 5) -> List[dict]:
    """Perform MongoDB Atlas Vector Search with instant in-memory cosine fallback."""
    # 1. Attempt Atlas Vector Search
    if chunks_collection is not None:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": max(50, top_k * 10),
                    "limit": top_k
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "documentId": 1,
                    "filename": 1,
                    "text": 1,
                    "page": 1,
                    "score": {"$meta": "vectorSearchScore"}
                }
            }
        ]
        try:
            results = list(chunks_collection.aggregate(pipeline))
            if results:
                return results
        except Exception as e:
            logger.warning(f"Atlas Vector Search unavailable (indexing or unconfigured): {e}")

    # 2. Instant In-Memory Cosine Fallback
    if IN_MEMORY_CHUNKS:
        scored = []
        for c in IN_MEMORY_CHUNKS:
            if "embedding" in c and c["embedding"]:
                sim = cosine_similarity(query_vector, c["embedding"])
                scored.append({
                    "documentId": c.get("documentId"),
                    "filename": c.get("filename", "Uploaded File"),
                    "page": c.get("page", 1),
                    "text": c.get("text", ""),
                    "score": round(sim, 4)
                })
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    # 3. Seed Fallback Docs (for initial preview prior to any uploads)
    return SAMPLE_FALLBACK_DOCS[:top_k]


# ==========================================
# ENDPOINTS
# ==========================================

@app.post("/ingest")
async def ingest_document(file: UploadFile = File(...)):
    """Accepts .pdf, .txt, .md files, extracts text, chunks, embeds, and stores in MongoDB & Memory."""
    filename = file.filename or "uploaded_document"
    ext = filename.lower().split(".")[-1]
    if ext not in ["pdf", "txt", "md"]:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Only PDF (.pdf), Text (.txt), and Markdown (.md) are supported."
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    pages_content = []
    if ext == "pdf":
        try:
            pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            for page_num, page in enumerate(pdf_reader.pages, start=1):
                text = page.extract_text() or ""
                if text.strip():
                    pages_content.append((page_num, text.strip()))
        except Exception as e:
            logger.error(f"Failed to parse PDF {filename}: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to parse PDF document: {str(e)}")
    else:
        # .txt or .md
        try:
            text = file_bytes.decode("utf-8", errors="ignore").strip()
            if text:
                pages_content.append((1, text))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read text content: {str(e)}")

    if not pages_content:
        raise HTTPException(status_code=400, detail="No readable text extracted from document.")

    document_id = f"doc_{uuid.uuid4().hex[:10]}"
    uploaded_at = datetime.utcnow().isoformat() + "Z"
    new_chunks = []
    chunk_index = 0

    for page_num, page_text in pages_content:
        page_chunks = chunk_text(page_text, chunk_size=700, overlap=100)
        for chunk_snippet in page_chunks:
            # Generate embedding with retrieval_document task type
            embedding_vec = embed_text(chunk_snippet, task_type="retrieval_document")
            chunk_doc = {
                "documentId": document_id,
                "filename": filename,
                "page": page_num,
                "chunkIndex": chunk_index,
                "text": chunk_snippet,
                "embedding": embedding_vec,
                "uploadedAt": uploaded_at
            }
            new_chunks.append(chunk_doc)
            chunk_index += 1

    if not new_chunks:
        raise HTTPException(status_code=400, detail="Could not create chunks from provided document.")

    # 1. Insert into MongoDB
    if chunks_collection is not None:
        try:
            chunks_collection.insert_many(new_chunks)
            logger.info(f"Persisted {len(new_chunks)} chunks to MongoDB for document {filename}.")
        except Exception as e:
            logger.warning(f"Could not insert chunks to MongoDB (in-memory will still hold them): {e}")

    # 2. Append to in-memory store for instant retrieval
    IN_MEMORY_CHUNKS.extend(new_chunks)

    return {
        "status": "success",
        "documentId": document_id,
        "filename": filename,
        "chunkCount": len(new_chunks),
        "uploadedAt": uploaded_at
    }


@app.get("/documents", response_model=List[DocumentSummary])
def get_documents():
    """Lists all uploaded documents with chunk counts and upload timestamps."""
    docs_map = {}

    # First check MongoDB
    if chunks_collection is not None:
        try:
            pipeline = [
                {
                    "$group": {
                        "_id": "$documentId",
                        "filename": {"$first": "$filename"},
                        "uploadedAt": {"$first": "$uploadedAt"},
                        "chunkCount": {"$sum": 1}
                    }
                }
            ]
            for row in chunks_collection.aggregate(pipeline):
                doc_id = row["_id"]
                docs_map[doc_id] = DocumentSummary(
                    documentId=doc_id,
                    filename=row.get("filename") or "Document",
                    chunkCount=row.get("chunkCount", 0),
                    uploadedAt=row.get("uploadedAt")
                )
        except Exception as e:
            logger.warning(f"Error querying documents from MongoDB: {e}")

    # Merge with in-memory store
    for c in IN_MEMORY_CHUNKS:
        doc_id = c.get("documentId")
        if doc_id:
            if doc_id not in docs_map:
                docs_map[doc_id] = DocumentSummary(
                    documentId=doc_id,
                    filename=c.get("filename", "Uploaded File"),
                    chunkCount=1,
                    uploadedAt=c.get("uploadedAt")
                )
            else:
                # Update chunk count if in-memory holds more
                current = docs_map[doc_id]
                if current.chunkCount == 0:
                    current.chunkCount = 1

    # Return list sorted by upload date descending
    result = list(docs_map.values())
    result.sort(key=lambda x: x.uploadedAt or "", reverse=True)
    return result


@app.delete("/documents/{document_id}")
def delete_document(document_id: str):
    """Removes all chunks for a document from MongoDB and in-memory store."""
    global IN_MEMORY_CHUNKS
    deleted_mongo_count = 0

    if chunks_collection is not None:
        try:
            res = chunks_collection.delete_many({"documentId": document_id})
            deleted_mongo_count = res.deleted_count
        except Exception as e:
            logger.error(f"Error deleting from MongoDB: {e}")

    # Remove from memory
    initial_mem_count = len(IN_MEMORY_CHUNKS)
    IN_MEMORY_CHUNKS = [c for c in IN_MEMORY_CHUNKS if c.get("documentId") != document_id]
    deleted_mem_count = initial_mem_count - len(IN_MEMORY_CHUNKS)

    return {
        "status": "deleted",
        "documentId": document_id,
        "deletedFromMongo": deleted_mongo_count,
        "deletedFromMemory": deleted_mem_count
    }


@app.post("/retrieve-and-generate", response_model=RetrieveAndGenerateResponse)
async def retrieve_and_generate(payload: RetrieveAndGenerateRequest):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # 1. Embed user query
    query_vector = embed_text(query, task_type="retrieval_query")

    # 2. Vector Search against MongoDB or in-memory fallback
    retrieved_docs = retrieve_relevant_chunks(query_vector, top_k=payload.top_k or 5)

    # 3. Format context & sources
    sources = []
    context_blocks = []
    for doc in retrieved_docs:
        snippet = doc.get("text", "")
        doc_id = str(doc.get("documentId", ""))
        filename = doc.get("filename") or doc_id
        page = doc.get("page")
        score = doc.get("score")

        sources.append(SourceItem(
            document_id=doc_id,
            filename=filename,
            page=page,
            snippet=snippet[:350] + ("..." if len(snippet) > 350 else ""),
            score=round(score, 4) if score is not None else None
        ))

        page_str = f" (Page {page})" if page else ""
        context_blocks.append(f"[{filename}{page_str}]:\n{snippet}")

    context_str = "\n\n".join(context_blocks) if context_blocks else "No relevant context found."

    # 4. Construct grounded prompt
    prompt = f"""You are EduQuery AI, a knowledgeable, precise academic assistant.
Use the provided course context below to answer the student's question clearly, thoroughly, and academically.
If the provided context partially covers the answer, synthesize the concepts with rigor and cite the principles accurately.
Format your answer with clear markdown: use headings (###), bullet points, and code blocks where applicable.

Context:
---------------------
{context_str}
---------------------

Question: {query}

Academic Answer:"""

    # 5. Call Gemini to synthesize final response
    answer = ""
    candidate_models = ["models/gemini-3.5-flash", "models/gemini-3.5-flash-lite", "models/gemini-3-flash-preview"]
    last_err = None

    for m_name in candidate_models:
        try:
            model = genai.GenerativeModel(m_name)
            generation_response = model.generate_content(prompt)
            answer = generation_response.text.strip()
            if answer:
                break
        except Exception as e:
            last_err = e
            logger.warning(f"Failed generation with {m_name}: {e}")
            continue

    if not answer:
        logger.error(f"Gemini generation error: {last_err}")
        raise HTTPException(
            status_code=500,
            detail=f"LLM generation failed: {str(last_err)}"
        )

    return RetrieveAndGenerateResponse(
        answer=answer,
        sources=sources
    )


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "mongo_connected": chunks_collection is not None,
        "gemini_configured": bool(GEMINI_API_KEY),
        "in_memory_chunks": len(IN_MEMORY_CHUNKS)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
