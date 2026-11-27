from typing import List, Optional, Dict, Any, Tuple
import time
import numpy as np
import google.generativeai as genai
from config import (
    chunks_collection,
    EMBEDDING_MODEL,
    SIMILARITY_THRESHOLD,
    logger,
    GEMINI_API_KEY
)

# In-memory vector store for instant zero-lag prototype demo fallback
IN_MEMORY_CHUNKS: List[Dict[str, Any]] = []

# Track whether Atlas $vectorSearch index is verified and operational
ATLAS_INDEX_OPERATIONAL: Optional[bool] = None
LAST_ATLAS_INDEX_CHECK: float = 0

# In-memory TTL query cache: key -> {"data": dict, "expires_at": float}
QUERY_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 600  # 10 minutes TTL

# Bounded in-memory embedding vector cache: normalized_text -> List[float] (max 250 entries)
EMBED_CACHE: Dict[str, List[float]] = {}
MAX_EMBED_CACHE_SIZE = 250

def get_cached_query(query: str, course_filter: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieves cached response if available and not expired."""
    key = f"{query.lower().strip()}:{(course_filter or 'all').lower().strip()}"
    item = QUERY_CACHE.get(key)
    if item:
        if item["expires_at"] > time.time():
            logger.info(f"Query cache HIT for key: {key}")
            return item["data"]
        else:
            del QUERY_CACHE[key]
    return None

def set_cached_query(query: str, course_filter: Optional[str], data: Dict[str, Any]):
    """Stores query response in TTL cache."""
    key = f"{query.lower().strip()}:{(course_filter or 'all').lower().strip()}"
    QUERY_CACHE[key] = {
        "data": data,
        "expires_at": time.time() + CACHE_TTL_SECONDS
    }

def invalidate_query_cache():
    """Invalidates all cached query responses (called on upload/delete)."""
    global QUERY_CACHE, ATLAS_INDEX_OPERATIONAL
    count = len(QUERY_CACHE)
    QUERY_CACHE.clear()
    ATLAS_INDEX_OPERATIONAL = None  # Re-check on next search
    logger.info(f"Query cache invalidated ({count} items purged).")

def ensure_chunks_loaded():
    """Self-healing loader: ensures IN_MEMORY_CHUNKS is populated from MongoDB Atlas."""
    global IN_MEMORY_CHUNKS
    if not IN_MEMORY_CHUNKS and chunks_collection is not None:
        try:
            stored = list(chunks_collection.find({}, {"_id": 0}))
            if stored:
                IN_MEMORY_CHUNKS.extend(stored)
                logger.info(f"Self-healed memory store: loaded {len(stored)} chunks from MongoDB.")
        except Exception as e:
            logger.warning(f"Could not load chunks from MongoDB: {e}")

def get_total_chunk_count(course_filter: Optional[str] = None) -> int:
    """Returns the total number of chunks available in MongoDB or in-memory store."""
    ensure_chunks_loaded()
    count = 0

    if IN_MEMORY_CHUNKS:
        if course_filter and course_filter.lower() != "all courses":
            count = sum(
                1 for c in IN_MEMORY_CHUNKS
                if c.get("course") and c.get("course").lower() == course_filter.lower()
            )
        else:
            count = len(IN_MEMORY_CHUNKS)

    if count == 0 and chunks_collection is not None:
        try:
            query = {}
            if course_filter and course_filter.lower() != "all courses":
                query["course"] = course_filter
            count = chunks_collection.count_documents(query)
        except Exception:
            pass

    return count

def preload_memory_store():
    """Preloads stored MongoDB chunks into in-memory store on startup."""
    global IN_MEMORY_CHUNKS
    if chunks_collection is not None:
        try:
            stored = list(chunks_collection.find({}, {"_id": 0}))
            if stored:
                IN_MEMORY_CHUNKS.clear()
                IN_MEMORY_CHUNKS.extend(stored)
                logger.info(f"Preloaded {len(stored)} chunks into memory store.")
        except Exception as e:
            logger.warning(f"Could not preload chunks into memory: {e}")

def embed_text(text: str, task_type: str = "retrieval_query") -> List[float]:
    """Generates 3072-dimensional vector embedding using Gemini embedding model with in-memory caching."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    cache_key = text.strip().lower()
    if cache_key in EMBED_CACHE:
        logger.info(f"EMBED_CACHE HIT for: {cache_key[:35]}...")
        return EMBED_CACHE[cache_key]

    try:
        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=text,
            task_type=task_type,
            request_options={"timeout": 15}
        )
        vec = result["embedding"]
        if len(EMBED_CACHE) >= MAX_EMBED_CACHE_SIZE:
            first_key = next(iter(EMBED_CACHE))
            EMBED_CACHE.pop(first_key, None)
        EMBED_CACHE[cache_key] = vec
        return vec
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        raise e

def embed_texts(texts: List[str], task_type: str = "retrieval_document") -> List[List[float]]:
    """Generates embeddings for a batch of text chunks."""
    if not texts:
        return []
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    try:
        res = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=texts,
            task_type=task_type,
            request_options={"timeout": 30}
        )
        embeddings = res.get("embedding")
        if isinstance(embeddings, list) and len(embeddings) == len(texts):
            return embeddings
    except Exception as batch_err:
        logger.warning(f"Batch embedding failed ({batch_err}); falling back to sequential embedding.")

    # Sequential fallback
    results = []
    for t in texts:
        results.append(embed_text(t, task_type=task_type))
    return results

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes cosine similarity between two float vectors via NumPy."""
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

def retrieve_chunks(
    query_vector: List[float],
    top_k: int = 5,
    course_filter: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Retrieves top-k relevant chunks from MongoDB Atlas Vector Search,
    with automatic fast fallback to in-memory cosine similarity search.
    Strictly ZERO mock/fallback hardcoded documents.
    Returns: (chunks_list, is_grounded)
    """
    global ATLAS_INDEX_OPERATIONAL, LAST_ATLAS_INDEX_CHECK
    retrieved = []
    normalized_course = course_filter if (course_filter and course_filter.lower() != "all courses") else None

    # Self-heal: ensure in-memory chunks are ready
    ensure_chunks_loaded()

    now = time.time()
    # Check if we should attempt Atlas $vectorSearch (re-try every 300s if failed previously)
    should_try_atlas = (
        chunks_collection is not None
        and (ATLAS_INDEX_OPERATIONAL is not False or (now - LAST_ATLAS_INDEX_CHECK) > 300)
    )

    # 1. MongoDB Atlas Vector Search
    if should_try_atlas:
        LAST_ATLAS_INDEX_CHECK = now
        vector_search_stage: Dict[str, Any] = {
            "index": "vector_index",
            "path": "embedding",
            "queryVector": query_vector,
            "numCandidates": max(50, top_k * 10),
            "limit": top_k
        }

        if normalized_course:
            vector_search_stage["filter"] = {"course": {"$eq": normalized_course}}

        pipeline = [
            {"$vectorSearch": vector_search_stage},
            {
                "$project": {
                    "_id": 0,
                    "documentId": 1,
                    "filename": 1,
                    "course": 1,
                    "page": 1,
                    "text": 1,
                    "score": {"$meta": "vectorSearchScore"}
                }
            }
        ]

        try:
            results = list(chunks_collection.aggregate(pipeline))
            if results:
                retrieved = results
                ATLAS_INDEX_OPERATIONAL = True
        except Exception as e:
            ATLAS_INDEX_OPERATIONAL = False
            logger.info(f"Atlas $vectorSearch not yet active on cluster (using fast in-memory cosine similarity): {e}")

    # 2. Fast In-Memory Cosine Similarity Fallback (<10ms)
    if not retrieved and IN_MEMORY_CHUNKS:
        candidates = []
        for c in IN_MEMORY_CHUNKS:
            if normalized_course and c.get("course"):
                if c.get("course").lower() != normalized_course.lower():
                    continue
            if "embedding" in c and c["embedding"]:
                sim = cosine_similarity(query_vector, c["embedding"])
                candidates.append({
                    "documentId": c.get("documentId"),
                    "filename": c.get("filename", "Course Document"),
                    "course": c.get("course", "General"),
                    "page": c.get("page", 1),
                    "text": c.get("text", ""),
                    "score": round(sim, 4)
                })
        candidates.sort(key=lambda x: x["score"], reverse=True)
        retrieved = candidates[:top_k]

    # Guardrail evaluation: check if top chunk meets the similarity threshold
    is_grounded = True
    if retrieved:
        top_score = retrieved[0].get("score")
        if top_score is not None and top_score < SIMILARITY_THRESHOLD:
            is_grounded = False
    else:
        is_grounded = False

    return retrieved, is_grounded
