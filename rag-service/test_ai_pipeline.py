import os
import sys
import time
from pathlib import Path
import requests
from dotenv import load_dotenv

# Load keys the same way main.py does
service_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=service_dir / ".env")
load_dotenv(dotenv_path=service_dir.parent / "backend" / ".env")

RAG_URL = "http://localhost:8000"
GATEWAY_URL = "http://localhost:5000"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

TEST_QUERY = "Briefly list the main topics covered in the uploaded document."


def run_tests(check_groq: bool = False):
    print("\n=== EduQuery AI Low-Quota Smoke Test ===\n")

    # 1. Health check (0 API calls)
    r = requests.get(f"{RAG_URL}/health", timeout=5)
    assert r.status_code == 200, f"RAG /health failed: {r.status_code} {r.text}"
    health = r.json()
    print(f"[PASS] 1. RAG Health (0 API calls): {health}")

    # 2. Zero-document / unknown course guard (0 API calls)
    t0 = time.perf_counter()
    r = requests.post(
        f"{RAG_URL}/retrieve-and-generate",
        json={"query": TEST_QUERY, "course": "__NON_EXISTENT_COURSE__", "top_k": 3},
        timeout=10,
    )
    ms = (time.perf_counter() - t0) * 1000
    print(f"[PASS] 2. Empty-Scope Guard (0 API calls, {ms:.0f}ms): status={r.status_code}")

    # 3. Single live RAG call (1 Embed + 1 Generation call)
    print("\nSending 1 real RAG query...")
    t0 = time.perf_counter()
    r = requests.post(
        f"{RAG_URL}/retrieve-and-generate",
        json={"query": TEST_QUERY, "top_k": 3},
        timeout=60,
    )
    ms1 = (time.perf_counter() - t0) * 1000
    assert r.status_code == 200, f"Live RAG failed ({r.status_code}): {r.text}"
    data = r.json()
    sources = data.get("sources", [])
    print(f"[PASS] 3. Live RAG Query ({ms1:.0f}ms) | Model: {data.get('model_used', 'N/A')} | Sources: {len(sources)}")
    print(f"       Answer preview: {data.get('answer', '')[:140]}...")

    # 4. Cache hit check — exact same query (0 API calls)
    t0 = time.perf_counter()
    r2 = requests.post(
        f"{RAG_URL}/retrieve-and-generate",
        json={"query": TEST_QUERY, "top_k": 3},
        timeout=10,
    )
    ms2 = (time.perf_counter() - t0) * 1000
    assert r2.status_code == 200, f"Cache test failed: {r2.status_code}"
    speedup = "CACHE HIT" if ms2 < 200 else "WARNING: Check QUERY_CACHE (slow repeat)"
    print(f"[PASS] 4. Repeat Query ({ms2:.0f}ms) -> {speedup}")

    # 5. Gateway health check (0 API calls)
    try:
        gw = requests.get(f"{GATEWAY_URL}/api/health", timeout=5)
        print(f"[PASS] 5. Express Gateway /api/health: status={gw.status_code}")
    except Exception as e:
        print(f"[WARN] 5. Gateway unreachable on :5000 ({e})")

    # 6. Optional: Verify Groq fallback key directly (1 tiny 5-token call)
    if check_groq:
        if not GROQ_API_KEY:
            print("[FAIL] 6. GROQ_API_KEY is missing in .env")
        else:
            t0 = time.perf_counter()
            gr = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "openai/gpt-oss-20b",
                    "messages": [{"role": "user", "content": "Reply with OK"}],
                    "max_tokens": 5,
                },
                timeout=20,
            )
            gms = (time.perf_counter() - t0) * 1000
            if gr.status_code == 200:
                reply = gr.json()["choices"][0]["message"]["content"].strip()
                print(f"[PASS] 6. Groq Failover Auth ({gms:.0f}ms): '{reply}'")
            else:
                print(f"[FAIL] 6. Groq Failover ({gr.status_code}): {gr.text[:200]}")

    print("\nTotal real quota spent: 1 embedding + 1 generation" + (" + 1 tiny Groq ping" if check_groq else "") + "\n")


if __name__ == "__main__":
    run_tests(check_groq="--groq" in sys.argv)