# EduQuery AI — System Architecture & Data Flow Blueprint

**Document-grounded academic query assistant**
Stack: React/Tailwind → Node.js/Express → Python RAG microservice → MongoDB Atlas (Vector Search) → Gemini API

---

## 1. System Architecture Breakdown

### 1.1 High-level topology

```
┌─────────────────┐        REST/JSON over HTTPS        ┌──────────────────────┐
│  React + Tailwind │ ─────────────────────────────────▶ │  Node.js / Express    │
│  (Frontend SPA)   │ ◀───────────────────────────────── │  "API Gateway" layer  │
└─────────────────┘                                      └──────────┬───────────┘
                                                                     │
                                    ┌────────────────────────────────┼──────────────────────────┐
                                    │                                │                          │
                                    ▼                                ▼                          ▼
                          ┌──────────────────┐            ┌───────────────────┐      ┌───────────────────┐
                          │  MongoDB Atlas    │            │  Python RAG        │      │  File Storage      │
                          │  - Users          │◀──────────▶│  Microservice      │      │  (local disk /     │
                          │  - Documents       │  internal  │  (FastAPI/Flask)   │      │  GridFS / S3-like) │
                          │  - Chunks + vectors│  HTTP      │                    │      └───────────────────┘
                          │  - Conversations   │            └─────────┬──────────┘
                          └──────────────────┘                        │
                                                                       ▼
                                                             ┌───────────────────┐
                                                             │  Google Gemini API │
                                                             │  (embeddings + LLM)│
                                                             └───────────────────┘
```

### 1.2 Role of each component

**React + Tailwind (Frontend)**
- Talks *only* to Node.js — never directly to the Python service or MongoDB. This keeps a single, auth-controlled entry point and matches your two-person split cleanly (frontend dev never needs to know the RAG internals).
- Responsibilities: auth screens (login/register), admin document-upload UI with progress/status polling, student chat UI with streaming or polled responses, citation rendering (show which document/page a chunk came from).

**Node.js + Express (Backend / Orchestrator)**
- This is the system's *only* public-facing API and the only service that talks to the database directly for non-RAG concerns (users, document metadata, conversation history, auth).
- Responsibilities:
  - REST API surface for the frontend
  - JWT-based auth + role-based access control (`admin` vs `student`)
  - Receives PDF uploads (multipart), stores the raw file, writes a `Document` record with status `PENDING`, then triggers ingestion on the Python service (fire-and-forget or a job queue)
  - Proxies/query-routes chat requests to the Python service, persists the resulting conversation turn
  - Does **not** do embedding, chunking, or vector search itself — that's the Python service's job. Node stays "thin": HTTP, auth, persistence of business data, and orchestration.

**Python Microservice (RAG core)**
- Framework-free RAG, built manually. Runs as an internal-only service (not exposed to the internet directly — only reachable from Node, e.g., via Docker internal network or localhost in dev).
- Exposes two internal endpoints:
  - `POST /ingest` — given a document reference, extract text, chunk it, embed each chunk via Gemini's embedding model, and store the vectors in MongoDB Atlas Vector Search collection.
  - `POST /query` — given a user question, embed the question, run a `$vectorSearch` aggregation against MongoDB, assemble a context window from top-k chunks, construct a prompt, call Gemini's generation endpoint, return the answer + source chunk metadata.
- This service is where **you** own 100% of the pipeline logic (chunking strategy, retrieval strategy, prompt construction) — exactly the "learn the mechanics" boundary you want.

**MongoDB Atlas (M0 + Vector Search)**
- Single database, multiple collections (detailed in §4).
- Vector Search index lives on the `chunks` collection. Both Node (for metadata CRUD) and Python (for vector search + chunk writes) connect to the same cluster, but conceptually Python "owns" the `chunks` collection and Node "owns" `users`/`documents`/`conversations`. This separation matters more for your own sanity than for MongoDB — enforce it by convention since M0 doesn't have fine-grained per-service DB users on the free tier in a meaningful way.

**Google Gemini API**
- Two distinct usages from the Python service: an **embedding model** (e.g., `text-embedding-004` or the current Gemini embedding model) for chunk/query vectors, and a **generative model** (e.g., a `gemini-1.5-flash`/`2.x` family model) for answer synthesis. Only the Python service holds the Gemini API key — never expose it to Node or the frontend.

### 1.3 Why this shape

- **Single ingress point (Node)** simplifies auth, rate limiting, and CORS — the frontend team only ever needs one base URL and one contract.
- **Python isolated as an internal service** lets you iterate on RAG internals (chunking size, retrieval k, prompt template) without touching Node/React at all, and lets your teammate build UI against a stable Node contract while you're still tuning retrieval quality.
- **Both backend services hitting MongoDB directly** (rather than routing all DB access through Node) avoids an unnecessary hop for vector search latency, which matters on M0's limited resources.

---

## 2. Data Flow

### 2.A Administrator uploads an official PDF

```
Admin (React)                Node.js                    Python RAG Service              MongoDB Atlas              Gemini
     │                          │                                │                            │                       │
     │  POST /api/documents     │                                │                            │                       │
     │  (multipart PDF + meta)  │                                │                            │                       │
     │─────────────────────────▶│                                │                            │                       │
     │                          │  1. Validate admin role (JWT)  │                            │                       │
     │                          │  2. Save file to disk/storage  │                            │                       │
     │                          │  3. Insert Document doc        │                            │                       │
     │                          │     status: "PENDING"          │                            │                       │
     │                          │───────────────────────────────────────────────────────────▶│                       │
     │  202 Accepted             │                                │                            │                       │
     │  { documentId, status }   │                                │                            │                       │
     │◀─────────────────────────│                                │                            │                       │
     │                          │  4. POST /ingest               │                            │                       │
     │                          │     { documentId, filePath }   │                            │                       │
     │                          │───────────────────────────────▶│                            │                       │
     │                          │                                │ 5. Load PDF, extract text  │                       │
     │                          │                                │ 6. Chunk (e.g., ~500 tok,  │                       │
     │                          │                                │    ~50 tok overlap)         │                       │
     │                          │                                │ 7. Embed each chunk ───────────────────────────────▶│
     │                          │                                │                            │      embedding vec    │
     │                          │                                │◀──────────────────────────────────────────────────│
     │                          │                                │ 8. Bulk insert chunks +    │                       │
     │                          │                                │    vectors + metadata       │                       │
     │                          │                                │───────────────────────────▶│                       │
     │                          │                                │ 9. Update Document          │                       │
     │                          │                                │    status: "READY"          │                       │
     │                          │                                │───────────────────────────▶│                       │
     │  (frontend polls or      │  GET /api/documents/:id        │                            │                       │
     │   uses websocket/SSE)    │◀───────────────────────────────────────────────────────────▶│                       │
     │  status: "READY"          │                                │                            │                       │
     │◀─────────────────────────│                                │                            │                       │
```

Key design notes:
- Step 4 should be **asynchronous from the client's perspective** — Node responds `202 Accepted` immediately after persisting the `PENDING` document, then calls Python either fire-and-forget (fine for an M0/university-project scale) or via a lightweight job queue (e.g., an in-memory queue or `bull`/`agenda` if you want retry semantics later).
- The frontend polls `GET /api/documents/:id` (or a list endpoint) every few seconds to reflect `PENDING → PROCESSING → READY/FAILED`. This is simpler than websockets for a two-person project and totally sufficient.
- On chunking failure or embedding API failure, Python should still call back (or Node should catch a failed call) and set status `FAILED` with an error message, not leave it stuck at `PENDING`.

### 2.B Student submits a natural-language question

```
Student (React)              Node.js                    Python RAG Service              MongoDB Atlas              Gemini
     │                          │                                │                            │                       │
     │  POST /api/chat/query    │                                │                            │                       │
     │  { question, convId? }   │                                │                            │                       │
     │─────────────────────────▶│                                │                            │                       │
     │                          │ 1. Validate student JWT        │                            │                       │
     │                          │ 2. (optional) fetch recent      │                            │                       │
     │                          │    conversation turns for       │                            │                       │
     │                          │    context                       │                            │                       │
     │                          │───────────────────────────────▶│                            │                       │
     │                          │  POST /query                    │                            │                       │
     │                          │  { question, history, filters } │                            │                       │
     │                          │                                │ 3. Embed the question ─────────────────────────────▶│
     │                          │                                │◀──────────────────────────────────────────────────│
     │                          │                                │ 4. $vectorSearch on         │                       │
     │                          │                                │    `chunks` collection      │                       │
     │                          │                                │    (top-k, e.g., k=5)       │                       │
     │                          │                                │───────────────────────────▶│                       │
     │                          │                                │◀───────────────────────────│                       │
     │                          │                                │ 5. Build grounded prompt    │                       │
     │                          │                                │    (system + context chunks │                       │
     │                          │                                │     + question + history)   │                       │
     │                          │                                │ 6. Call Gemini generate ───────────────────────────▶│
     │                          │                                │◀──────────────────────────────────────────────────│
     │                          │  { answer, sources[] }          │ 7. Return answer + cited    │                       │
     │                          │◀───────────────────────────────│    chunk metadata           │                       │
     │                          │ 8. Persist turn to               │                            │                       │
     │                          │    Conversations collection      │                            │                       │
     │                          │───────────────────────────────────────────────────────────▶│                       │
     │  200 OK                  │                                │                            │                       │
     │  { answer, sources[],    │                                │                            │                       │
     │    conversationId }      │                                │                            │                       │
     │◀─────────────────────────│                                │                            │                       │
```

Key design notes:
- **Node stores conversation history**, but **Python is stateless per-request** — it receives whatever history/context Node decides to send. This keeps the RAG service simple and testable in isolation (you can `curl` it directly while building it).
- `sources[]` returned from Python should carry enough metadata (documentId, page/section, chunk text snippet, similarity score) for the frontend to render citations — this is a big credibility win for an "academic query assistant" and cheap to add if you design the schema for it up front.
- Consider a **guardrail step**: if the top retrieved chunks' similarity scores are all below a threshold, have Python return a "not found in provided documents" response rather than letting Gemini hallucinate an answer — this is core to being "document-grounded" rather than a generic chatbot.

---

## 3. API Contracts

### 3.1 Frontend ↔ Node.js

**Auth**

```http
POST /api/auth/login
```
```json
// Request
{ "email": "student@uni.edu", "password": "••••••••" }

// Response 200
{
  "token": "eyJhbGciOi...",
  "user": { "id": "665f...", "name": "Anish", "role": "student" }
}
```

**Upload document (admin)**

```http
POST /api/documents
Content-Type: multipart/form-data
Authorization: Bearer <token>
```
```
fields: file=<pdf binary>, title="Data Structures Unit 3", course="CS201", tags=["dsa","trees"]
```
```json
// Response 202 Accepted
{
  "documentId": "66a1f0...",
  "title": "Data Structures Unit 3",
  "status": "PENDING"
}
```

**Poll document status**

```http
GET /api/documents/:id
Authorization: Bearer <token>
```
```json
// Response 200
{
  "documentId": "66a1f0...",
  "title": "Data Structures Unit 3",
  "status": "READY",          // PENDING | PROCESSING | READY | FAILED
  "chunkCount": 42,
  "error": null,
  "createdAt": "2026-08-27T10:00:00Z"
}
```

**Student chat query**

```http
POST /api/chat/query
Authorization: Bearer <token>
```
```json
// Request
{
  "question": "What is the time complexity of AVL tree rotation?",
  "conversationId": "66a2b3..." ,   // omit to start a new conversation
  "courseFilter": "CS201"            // optional, scopes retrieval to a course/doc set
}

// Response 200
{
  "conversationId": "66a2b3...",
  "answer": "AVL tree rotations run in O(1) time per rotation...",
  "sources": [
    {
      "documentId": "66a1f0...",
      "documentTitle": "Data Structures Unit 3",
      "page": 14,
      "snippet": "A single rotation in an AVL tree touches a constant number of pointers...",
      "score": 0.87
    }
  ],
  "grounded": true
}
```

### 3.2 Node.js ↔ Python RAG Service (internal)

**Ingest**

```http
POST /ingest
```
```json
// Request
{
  "documentId": "66a1f0...",
  "filePath": "/storage/docs/66a1f0.pdf",
  "metadata": { "title": "Data Structures Unit 3", "course": "CS201" }
}

// Response 200
{
  "documentId": "66a1f0...",
  "status": "READY",
  "chunkCount": 42
}

// Response 500 (failure case)
{
  "documentId": "66a1f0...",
  "status": "FAILED",
  "error": "Could not extract text: encrypted PDF"
}
```

**Query**

```http
POST /query
```
```json
// Request
{
  "question": "What is the time complexity of AVL tree rotation?",
  "history": [
    { "role": "user", "content": "Explain AVL trees." },
    { "role": "assistant", "content": "An AVL tree is a self-balancing BST..." }
  ],
  "topK": 5,
  "courseFilter": "CS201"
}

// Response 200
{
  "answer": "AVL tree rotations run in O(1) time per rotation...",
  "sources": [
    {
      "chunkId": "66b7...",
      "documentId": "66a1f0...",
      "documentTitle": "Data Structures Unit 3",
      "page": 14,
      "snippet": "A single rotation in an AVL tree touches...",
      "score": 0.87
    }
  ],
  "grounded": true,
  "tokensUsed": { "prompt": 812, "completion": 96 }
}
```

Keeping the Node↔Python contract independent of the Frontend↔Node contract (rather than reusing one shape for both) gives you room to add retrieval-only debug fields (`tokensUsed`, raw scores) on the internal side without leaking them to the UI, and to change internal RAG params without touching frontend code.

---

## 4. Database Schema (MongoDB Atlas)

### 4.1 `users`

```json
{
  "_id": ObjectId,
  "name": "Anish",
  "email": "anish@uni.edu",
  "passwordHash": "bcrypt...",
  "role": "admin" | "student",
  "createdAt": ISODate
}
```

### 4.2 `documents`

```json
{
  "_id": ObjectId,
  "title": "Data Structures Unit 3",
  "course": "CS201",
  "tags": ["dsa", "trees"],
  "uploadedBy": ObjectId("...user..."),
  "filePath": "/storage/docs/66a1f0.pdf",
  "status": "PENDING" | "PROCESSING" | "READY" | "FAILED",
  "chunkCount": 42,
  "error": null,
  "createdAt": ISODate,
  "updatedAt": ISODate
}
```

### 4.3 `chunks` (the vector store — owned by the Python service)

```json
{
  "_id": ObjectId,
  "documentId": ObjectId("...documents..."),
  "text": "A single rotation in an AVL tree touches a constant number of pointers...",
  "page": 14,
  "chunkIndex": 37,
  "embedding": [0.0123, -0.0456, ...],   // float array, dimension matches Gemini embedding model
  "createdAt": ISODate
}
```

**Atlas Vector Search index** (defined via Atlas UI/API, on the `chunks` collection):

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,          // match your chosen Gemini embedding model's output dim
      "similarity": "cosine"
    },
    { "type": "filter", "path": "documentId" }
  ]
}
```

Adding `documentId` (and optionally `course`) as a **filter field** alongside the vector field lets `$vectorSearch` pre-filter by course/document without a separate query — this is how you'd implement the `courseFilter` param cheaply.

### 4.4 `conversations`

```json
{
  "_id": ObjectId,
  "userId": ObjectId("...users..."),
  "title": "AVL tree rotations",
  "turns": [
    {
      "role": "user",
      "content": "What is the time complexity of AVL tree rotation?",
      "timestamp": ISODate
    },
    {
      "role": "assistant",
      "content": "AVL tree rotations run in O(1) time per rotation...",
      "sources": [
        { "documentId": ObjectId, "page": 14, "score": 0.87 }
      ],
      "timestamp": ISODate
    }
  ],
  "createdAt": ISODate,
  "updatedAt": ISODate
}
```

Embedding turns as a subdocument array (rather than a separate `messages` collection) is a reasonable fit for M0's storage constraints and keeps a whole conversation readable in a single query — worth revisiting only if conversations get very long or you need per-message indexing.

---

## 5. A Few Architectural Judgment Calls Worth Flagging

- **M0 free tier limits**: 512MB storage, shared RAM, and a cap on the number of concurrent vector search index builds. Keep chunk size reasonable (don't over-chunk) and monitor storage as you ingest more documents — a few hundred PDFs at typical chunk sizes should fit, but it's worth checking usage periodically.
- **Node↔Python transport**: plain internal HTTP (as shown above) is the simplest choice and fine for a university project. If you outgrow synchronous fire-and-forget ingestion, a lightweight queue is the natural next step — not needed for v1.
- **Where "manual RAG" logic should live**: keep chunking strategy, prompt template, and retrieval-threshold logic in clearly separated modules inside the Python service (e.g., `chunking.py`, `retrieval.py`, `prompting.py`) rather than one monolithic script — this is what will make the "I built RAG manually" story easy to explain in your project defense/viva.
