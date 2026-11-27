from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
import os
import re
import time
from pathlib import Path
from dotenv import load_dotenv
import uuid
import json
import requests
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai

# Setup paths and load environment variables across all potential directories
service_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=service_dir / ".env")
load_dotenv(dotenv_path=service_dir.parent / "backend" / ".env")
load_dotenv(dotenv_path=service_dir.parent / ".env")
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

from config import (
    chunks_collection,
    documents_collection,
    GENERATION_MODELS,
    PORT,
    logger,
    GEMINI_API_KEY
)
from chunking import (
    extract_text_from_pdf,
    extract_text_from_plain,
    chunk_text
)
from retrieval import (
    embed_text,
    embed_texts,
    retrieve_chunks,
    preload_memory_store,
    get_cached_query,
    set_cached_query,
    invalidate_query_cache,
    get_total_chunk_count,
    ensure_chunks_loaded,
    IN_MEMORY_CHUNKS,
    QUERY_CACHE,
    EMBED_CACHE
)
from prompting import build_academic_prompt


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: preload MongoDB chunks into in-memory store
    try:
        preload_memory_store()
    except Exception as e:
        logger.warning(f"Startup preload error: {e}")
    yield


# Initialize FastAPI App with Lifespan
app = FastAPI(
    title="EduQuery AI — Academic RAG Microservice",
    description="Vector search & grounded synthesis via MongoDB Atlas & Google Gemini",
    version="2.5.1",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Schemas
class QueryRequest(BaseModel):
    question: Optional[str] = None
    query: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = []
    topK: Optional[int] = 5
    top_k: Optional[int] = 5
    filters: Optional[Dict[str, Any]] = {}
    courseFilter: Optional[str] = None
    course: Optional[str] = None


class SourceItem(BaseModel):
    document_id: Optional[str] = None
    filename: Optional[str] = None
    course: Optional[str] = None
    page: Optional[int] = None
    snippet: str
    score: Optional[float] = None


class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceItem]
    grounded: bool = True
    empty_knowledge_base: bool = False
    cached: bool = False
    model_used: Optional[str] = None
    tokensUsed: Optional[Dict[str, int]] = None


class DocumentSummary(BaseModel):
    documentId: str
    filename: str
    course: Optional[str] = "General"
    unit: Optional[str] = "General"
    chunkCount: int
    starterQuestions: Optional[List[str]] = []
    uploadedAt: Optional[str] = None


GROQ_FALLBACK_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-20b",
]


def generate_with_groq(prompt: str) -> Tuple[Optional[str], Optional[str]]:
    """Attempts generation via Groq free-tier LLM endpoints if GROQ_API_KEY is configured."""
    api_key = GROQ_API_KEY or os.getenv("GROQ_API_KEY")
    if not api_key:
        return None, None
    for model_name in GROQ_FALLBACK_MODELS:
        t_model = datetime.now()
        try:
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 900,
                    "temperature": 0.3
                },
                timeout=30
            )
            duration = (datetime.now() - t_model).total_seconds()
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"].get("content", "").strip()
                if content:
                    logger.info(f"[Query Pipeline] Groq fallback model '{model_name}' succeeded in {duration:.2f}s")
                    return content, f"groq/{model_name}"
                else:
                    logger.warning(f"[Query Pipeline] Groq model '{model_name}' returned empty content (reasoning-only or truncated).")
            else:
                logger.warning(f"[Query Pipeline] Groq model '{model_name}' returned HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            duration = (datetime.now() - t_model).total_seconds()
            logger.warning(f"[Query Pipeline] Groq model '{model_name}' failed in {duration:.2f}s: {e}")
            continue
    return None, None


def generate_starter_questions(excerpt: str, course: str = "General") -> List[str]:
    """Generates 3 dynamic starter questions for the ingested document using Gemini."""
    if not excerpt or not GEMINI_API_KEY:
        return [
            f"What are the primary topics covered in this {course} material?",
            f"Explain the core algorithms or definitions outlined in these notes.",
            f"What are the key exam takeaways from this document?"
        ]

    prompt = f"""You are an academic course instructor. Based on this excerpt from university course materials for '{course}', generate exactly 3 concise, highly relevant study questions that a student would ask to test their understanding.
Return ONLY a valid JSON array of 3 strings with NO markdown formatting and NO code block fences, e.g.:
["What is the definition of ...?", "Explain the difference between ... and ...", "How does ... work?"]

Excerpt:
\"\"\"
{excerpt[:2000]}
\"\"\""""

    for m_name in GENERATION_MODELS:
        try:
            model = genai.GenerativeModel(m_name)
            resp = model.generate_content(prompt, request_options={"timeout": 15})
            if resp and resp.text:
                raw_text = resp.text.strip()
                if raw_text.startswith("```"):
                    raw_text = raw_text.split("```")[1]
                    if raw_text.startswith("json"):
                        raw_text = raw_text[4:]
                    raw_text = raw_text.strip()
                parsed = json.loads(raw_text)
                if isinstance(parsed, list) and len(parsed) > 0:
                    cleaned = [str(q).strip() for q in parsed if str(q).strip()]
                    if len(cleaned) >= 3:
                        return cleaned[:3]
        except Exception as e:
            logger.warning(f"Starter questions generation attempt failed on {m_name}: {e}")
            continue

    return [
        f"What are the main concepts introduced in this {course} document?",
        f"Explain the foundational theory and steps described here.",
        f"What are practical exam questions based on this material?"
    ]


# ==========================================
# ENDPOINTS (Synchronous `def` for threadpool execution)
# ==========================================

@app.post("/ingest")
def ingest_document(
    file: UploadFile = File(...),
    documentId: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    course: Optional[str] = Form("General"),
    unit: Optional[str] = Form("General"),
):
    """
    Ingests PDF, TXT, or MD file.
    Executed in FastAPI threadpool so it does not block /health or the event loop.
    """
    filename = file.filename or "uploaded_file"
    ext = filename.lower().split(".")[-1]
    if ext not in ["pdf", "txt", "md"]:
        raise HTTPException(
            status_code=400,
            detail="Unsupported format. Only PDF (.pdf), Text (.txt), and Markdown (.md) are supported."
        )

    try:
        file_bytes = file.file.read()
    except Exception as read_err:
        raise HTTPException(status_code=400, detail=f"Failed reading uploaded file: {read_err}")

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    pages_data = []
    if ext == "pdf":
        try:
            pages_data = extract_text_from_pdf(file_bytes)
        except Exception as e:
            logger.error(f"PDF extraction error for {filename}: {e}")
            raise HTTPException(status_code=400, detail=f"PDF parsing error: {str(e)}")
    else:
        pages_data = extract_text_from_plain(file_bytes)

    # Validate non-empty text extraction
    combined_text = "".join(p_text for _, p_text in pages_data).strip() if pages_data else ""
    if not pages_data or not combined_text:
        raise HTTPException(
            status_code=400,
            detail="No readable text found in this file. Scanned/image-only PDFs aren't supported yet — OCR coming in v2."
        )

    # Split all pages into text chunks FIRST, before any DB or vector operations
    all_chunks_raw = []
    for page_num, text in pages_data:
        chunks = chunk_text(text, chunk_size=700, overlap=100)
        for snippet in chunks:
            all_chunks_raw.append({
                "page": page_num,
                "text": snippet
            })

    if not all_chunks_raw or len(all_chunks_raw) == 0:
        raise HTTPException(
            status_code=400,
            detail="No readable text found in this file. Scanned/image-only PDFs aren't supported yet — OCR coming in v2."
        )

    # Combine excerpt from first page(s) for starter questions
    first_excerpt = ""
    for _, page_text in pages_data[:2]:
        first_excerpt += page_text + "\n"
    starter_questions = generate_starter_questions(first_excerpt, course=course or "General")

    doc_id = documentId or f"doc_{uuid.uuid4().hex[:10]}"
    uploaded_at = datetime.utcnow().isoformat() + "Z"

    # Batch embed chunks (batches of 15)
    batch_size = 15
    new_chunks = []
    chunk_idx = 0

    for i in range(0, len(all_chunks_raw), batch_size):
        batch = all_chunks_raw[i:i + batch_size]
        batch_texts = [b["text"] for b in batch]
        try:
            batch_embeddings = embed_texts(batch_texts, task_type="retrieval_document")
        except Exception as e:
            logger.error(f"Batch embedding failed for {filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed generating vector embeddings: {str(e)}")

        for j, b in enumerate(batch):
            emb = batch_embeddings[j] if j < len(batch_embeddings) else []
            chunk_record = {
                "documentId": doc_id,
                "filename": filename,
                "title": title or filename,
                "course": course or "General",
                "unit": unit or "General",
                "page": b["page"],
                "chunkIndex": chunk_idx,
                "text": b["text"],
                "embedding": emb,
                "starterQuestions": starter_questions,
                "uploadedAt": uploaded_at
            }
            new_chunks.append(chunk_record)
            chunk_idx += 1

    if not new_chunks or len(new_chunks) == 0:
        raise HTTPException(
            status_code=400,
            detail="Failed generating vector chunks for this document. No valid content extracted."
        )

    # 1. MongoDB Persistence
    if chunks_collection is not None:
        try:
            chunks_collection.insert_many(new_chunks)
            logger.info(f"Inserted {len(new_chunks)} chunks into MongoDB for {filename}.")
        except Exception as e:
            logger.warning(f"MongoDB chunk insert error (holding in memory): {e}")

    # 2. In-Memory Store Appending
    IN_MEMORY_CHUNKS.extend(new_chunks)

    # 3. Invalidate query cache
    invalidate_query_cache()

    return {
        "status": "success",
        "documentId": doc_id,
        "filename": filename,
        "title": title or filename,
        "course": course or "General",
        "unit": unit or "General",
        "chunkCount": len(new_chunks),
        "starterQuestions": starter_questions,
        "uploadedAt": uploaded_at
    }


embed_query = embed_text


@app.post("/query", response_model=QueryResponse)
@app.post("/retrieve-and-generate", response_model=QueryResponse)
def retrieve_and_generate(payload: QueryRequest):
    """
    Main RAG pipeline:
    Executed in FastAPI worker threadpool (`def` rather than `async def`),
    ensuring that /health checks and the asyncio main loop remain completely unblocked.
    """
    t_start = datetime.now()
    user_query = payload.query or payload.question
    if not user_query or not user_query.strip():
        raise HTTPException(status_code=400, detail="Question or query cannot be empty.")

    user_query = user_query.strip()
    top_k = min(payload.top_k or payload.topK or 3, 4)
    course_filter = payload.course or payload.courseFilter or (payload.filters.get("course") if payload.filters else None)
    if course_filter and course_filter.strip().lower() in ["all", "all courses", ""]:
        course_filter = None
    else:
        course_filter = course_filter.strip() if course_filter else None

    # 1. Fast-Path Empty-Scope Guard (<50ms, 0 API calls)
    ensure_chunks_loaded()
    match_count = 0

    if course_filter:
        c_lower = course_filter.lower()
        match_count = sum(
            1 for c in IN_MEMORY_CHUNKS
            if c.get("course") and c.get("course").strip().lower() == c_lower
        )
        if match_count == 0 and chunks_collection is not None:
            try:
                match_count = chunks_collection.count_documents(
                    {"course": {"$regex": f"^{re.escape(course_filter)}$", "$options": "i"}},
                    limit=1
                )
            except Exception:
                try:
                    match_count = chunks_collection.count_documents({"course": course_filter}, limit=1)
                except Exception as e:
                    logger.warning(f"Mongo count_documents error: {e}")
    else:
        match_count = len(IN_MEMORY_CHUNKS)
        if match_count == 0 and chunks_collection is not None:
            try:
                match_count = chunks_collection.count_documents({}, limit=1)
            except Exception as e:
                logger.warning(f"Mongo count_documents error: {e}")

    if match_count == 0:
        empty_msg = (
            f"No documents have been uploaded for course **{course_filter}** yet. "
            "Please select another course or ask your course instructor to upload the syllabus and lecture notes."
            if course_filter
            else (
                "No course documents or syllabus materials have been uploaded to EduQuery AI yet. "
                "Please upload a course document via the Faculty portal to activate academic query answering."
            )
        )
        return QueryResponse(
            answer=empty_msg,
            sources=[],
            grounded=False,
            empty_knowledge_base=True,
            cached=False,
            model_used="none",
            tokensUsed={"prompt_estimate": 0, "completion_estimate": 0}
        )

    # 2. Check QUERY_CACHE immediately after empty-scope guard (BEFORE embed_query())
    cache_course = (payload.course or payload.courseFilter or "ALL").strip().lower()
    cache_top_k = payload.top_k or payload.topK or 3
    cache_key = (user_query.strip().lower(), cache_course, cache_top_k)

    now_ts = time.time()
    if cache_key in QUERY_CACHE:
        cached_entry = QUERY_CACHE[cache_key]
        exp = cached_entry.get("expires_at", cached_entry.get("timestamp", 0) + 600)
        if exp > now_ts:
            logger.info(f"[Query Pipeline] QUERY_CACHE HIT for key {cache_key} (<50ms)")
            cached_data = cached_entry.get("data", cached_entry)
            return QueryResponse(
                answer=cached_data["answer"],
                sources=[SourceItem(**s) for s in cached_data.get("sources", [])],
                grounded=cached_data.get("grounded", True),
                empty_knowledge_base=cached_data.get("empty_knowledge_base", False),
                cached=True,
                model_used=cached_data.get("model_used"),
                tokensUsed=cached_data.get("tokensUsed")
            )
        else:
            QUERY_CACHE.pop(cache_key, None)

    # 3. Stage 1: Embedding User Query
    t_emb_start = datetime.now()
    try:
        query_vec = embed_query(user_query, task_type="retrieval_query")
        emb_duration = (datetime.now() - t_emb_start).total_seconds()
        logger.info(f"[Query Pipeline] 1. Embedding completed in {emb_duration:.2f}s")
    except Exception as e:
        logger.error(f"[Query Pipeline] 1. Embedding failed: {e}")
        raise HTTPException(status_code=500, detail=f"Query embedding failed: {str(e)}")

    # 4. Stage 2: Retrieval & Guardrail Check
    t_ret_start = datetime.now()
    retrieved_chunks, is_grounded = retrieve_chunks(
        query_vector=query_vec,
        top_k=top_k,
        course_filter=course_filter
    )
    ret_duration = (datetime.now() - t_ret_start).total_seconds()
    logger.info(f"[Query Pipeline] 2. Retrieval completed in {ret_duration:.2f}s ({len(retrieved_chunks)} chunks, grounded: {is_grounded})")

    if not retrieved_chunks:
        scope_name = f"course '{course_filter}'" if course_filter else "uploaded materials"
        return QueryResponse(
            answer=f"I searched the {scope_name}, but could not find any relevant sections to answer this question. Try rephrasing or asking about a different topic covered in the syllabus.",
            sources=[],
            grounded=False,
            empty_knowledge_base=False,
            cached=False,
            tokensUsed={"prompt_estimate": 0, "completion_estimate": 0}
        )

    # 5. Format sources
    sources = []
    for c in retrieved_chunks:
        snippet = c.get("text", "")
        sources.append(SourceItem(
            document_id=c.get("documentId"),
            filename=c.get("filename") or c.get("documentId") or "Course Material",
            course=c.get("course"),
            page=c.get("page"),
            snippet=snippet[:350] + ("..." if len(snippet) > 350 else ""),
            score=c.get("score")
        ))

    # 6. Construct grounded prompt (capped chunks & concise length)
    prompt = build_academic_prompt(
        question=user_query,
        context_chunks=retrieved_chunks,
        history=payload.history or []
    )

    # 7. Stage 3: Synthesize response via candidate Gemini models (fastest first)
    t_gen_start = datetime.now()
    answer = ""
    last_err = None
    last_err_msg = ""
    used_model = None
    saw_rate_limit = False
    saw_timeout = False

    # Configured for fast, structured academic generation without unbounded token delays
    gen_config = genai.types.GenerationConfig(
        max_output_tokens=700,
        temperature=0.3
    )

    for m_name in GENERATION_MODELS:
        t_model_start = datetime.now()
        try:
            model = genai.GenerativeModel(m_name, generation_config=gen_config)
            resp = model.generate_content(prompt, request_options={"timeout": 45})
            if resp and resp.text:
                answer = resp.text.strip()
                used_model = m_name
                model_duration = (datetime.now() - t_model_start).total_seconds()
                logger.info(f"[Query Pipeline] Model '{m_name}' succeeded in {model_duration:.2f}s ({len(answer)} chars)")
                break
        except Exception as e:
            last_err = e
            last_err_msg = str(e)
            err_lower = last_err_msg.lower()
            if "429" in err_lower or "resourceexhausted" in err_lower or "quota" in err_lower or "rate limit" in err_lower:
                saw_rate_limit = True
            if "timeout" in err_lower or "timed out" in err_lower:
                saw_timeout = True
            model_duration = (datetime.now() - t_model_start).total_seconds()
            logger.warning(f"[Query Pipeline] Model '{m_name}' failed in {model_duration:.2f}s: {e}")
            continue

    # 7b. Automatic Groq Free-Tier Fallback if Gemini failed / rate-limited
    if not answer and GROQ_API_KEY:
        logger.info("[Query Pipeline] Gemini models exhausted or rate-limited; attempting Groq fallback...")
        groq_answer, groq_model = generate_with_groq(prompt)
        if groq_answer:
            answer = groq_answer
            used_model = groq_model

    gen_duration = (datetime.now() - t_gen_start).total_seconds()
    total_duration = (datetime.now() - t_start).total_seconds()

    if not answer:
        logger.error(f"[Query Pipeline] 3. Generation failed on all candidate models after {gen_duration:.2f}s: {last_err}")
        if saw_rate_limit:
            raise HTTPException(
                status_code=429,
                detail="Gemini API rate limit reached (free-tier quota exceeded). Please wait 15 seconds before retrying, or configure a GROQ_API_KEY fallback."
            )
        elif saw_timeout:
            raise HTTPException(
                status_code=504,
                detail="AI generation timed out across candidate models. Please retry with a shorter query."
            )
        else:
            raise HTTPException(
                status_code=502,
                detail=f"AI generation failed: {last_err_msg or 'Upstream model service unavailable.'}"
            )

    logger.info(f"[Query Pipeline] 3. Generation finished via {used_model} in {gen_duration:.2f}s (Total Pipeline: {total_duration:.2f}s)")

    tokens_used = {
        "prompt_estimate": len(prompt) // 4,
        "completion_estimate": len(answer) // 4
    }

    response_payload = QueryResponse(
        answer=answer,
        sources=sources,
        grounded=is_grounded,
        empty_knowledge_base=False,
        cached=False,
        model_used=used_model,
        tokensUsed=tokens_used
    )

    # 8. Cache response in TTL memory cache (10-minute TTL)
    now_ts = time.time()
    QUERY_CACHE[cache_key] = {
        "data": response_payload.dict(),
        "timestamp": now_ts,
        "expires_at": now_ts + 600
    }
    set_cached_query(user_query, course_filter, response_payload.dict())

    return response_payload


query_and_generate = retrieve_and_generate


@app.get("/documents", response_model=List[DocumentSummary])
def get_documents():
    """Returns list of unique indexed documents with chunk counts."""
    ensure_chunks_loaded()
    docs_map = {}

    if chunks_collection is not None:
        try:
            pipeline = [
                {
                    "$group": {
                        "_id": "$documentId",
                        "filename": {"$first": "$filename"},
                        "course": {"$first": "$course"},
                        "unit": {"$first": "$unit"},
                        "uploadedAt": {"$first": "$uploadedAt"},
                        "starterQuestions": {"$first": "$starterQuestions"},
                        "chunkCount": {"$sum": 1}
                    }
                }
            ]
            for row in chunks_collection.aggregate(pipeline):
                doc_id = str(row["_id"])
                docs_map[doc_id] = DocumentSummary(
                    documentId=doc_id,
                    filename=row.get("filename") or "Document",
                    course=row.get("course") or "General",
                    unit=row.get("unit") or "General",
                    chunkCount=row.get("chunkCount", 0),
                    starterQuestions=row.get("starterQuestions") or [],
                    uploadedAt=row.get("uploadedAt")
                )
        except Exception as e:
            logger.warning(f"MongoDB documents aggregation error: {e}")

    # Merge with in-memory chunks
    for c in IN_MEMORY_CHUNKS:
        doc_id = c.get("documentId")
        if doc_id:
            if doc_id not in docs_map:
                docs_map[doc_id] = DocumentSummary(
                    documentId=doc_id,
                    filename=c.get("filename", "Course Document"),
                    course=c.get("course", "General"),
                    unit=c.get("unit", "General"),
                    chunkCount=1,
                    starterQuestions=c.get("starterQuestions") or [],
                    uploadedAt=c.get("uploadedAt")
                )

    results = list(docs_map.values())
    results.sort(key=lambda x: x.uploadedAt or "", reverse=True)
    return results


@app.delete("/documents/{document_id}")
def delete_document(document_id: str):
    """Deletes all chunks for a document from MongoDB and in-memory cache, and invalidates query cache."""
    global IN_MEMORY_CHUNKS
    deleted_mongo = 0

    if chunks_collection is not None:
        try:
            res = chunks_collection.delete_many({"documentId": document_id})
            deleted_mongo = res.deleted_count
        except Exception as e:
            logger.error(f"MongoDB delete error: {e}")

    # Filter in-memory
    initial_len = len(IN_MEMORY_CHUNKS)
    IN_MEMORY_CHUNKS[:] = [c for c in IN_MEMORY_CHUNKS if c.get("documentId") != document_id]
    deleted_mem = initial_len - len(IN_MEMORY_CHUNKS)

    # Invalidate query cache
    invalidate_query_cache()

    return {
        "status": "deleted",
        "documentId": document_id,
        "deletedFromMongo": deleted_mongo,
        "deletedFromMemory": deleted_mem
    }


@app.get("/health")
def health_check():
    """Immediate, non-blocking health check that responds instantly."""
    global GROQ_API_KEY
    if not GROQ_API_KEY:
        GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    return {
        "status": "healthy",
        "mongo_connected": chunks_collection is not None,
        "gemini_configured": bool(GEMINI_API_KEY),
        "groq_configured": bool(GROQ_API_KEY),
        "in_memory_chunks": len(IN_MEMORY_CHUNKS),
        "cached_queries": len(QUERY_CACHE),
        "cached_embeddings": len(EMBED_CACHE)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
