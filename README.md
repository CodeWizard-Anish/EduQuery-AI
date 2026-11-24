# EduQuery AI — Document-Grounded Academic Query Assistant

EduQuery AI is a modern, 3-tier Retrieval-Augmented Generation (RAG) platform tailored for university courses, syllabus comprehension, and academic lecture notes. It pairs vector-grounded document search with Google's Gemini models to deliver verifiable, cited answers from official academic materials.

---

## Architecture Overview

```
┌───────────────────────────┐      POST /api/chat       ┌──────────────────────────────┐
│  React Frontend (Vite)    │ ────────────────────────▶ │  Node.js / Express Gateway   │
│  (Port 5173)              │ ◀──────────────────────── │  (Port 5000)                 │
└───────────────────────────┘       { answer, sources } └──────────────┬───────────────┘
                                                                       │
                                                        POST /retrieve-and-generate
                                                                       ▼
                                                        ┌──────────────────────────────┐
                                                        │  Python RAG Microservice     │
                                                        │  FastAPI (Port 8000)         │
                                                        └──────────────┬───────────────┘
                                                                       │
                                            ┌──────────────────────────┴──────────────────────────┐
                                            ▼                                                     ▼
                                 ┌──────────────────────┐                              ┌──────────────────────┐
                                 │  MongoDB Atlas       │                              │  Google Gemini API   │
                                 │  $vectorSearch       │                              │  - gemini-embedding- │
                                 │  (chunks collection) │                              │    001 (3072-dim)    │
                                 │  + In-Memory Cache   │                              │  - gemini-3.5-flash  │
                                 └──────────────────────┘                              └──────────────────────┘
```

---

## Key Features

- **Document Ingestion Pipeline (`POST /ingest`)**:
  - Supports **PDF (.pdf)**, **Text (.txt)**, and **Markdown (.md)** uploads.
  - Page-by-page extraction with `pypdf`.
  - Overlapping sliding-window chunking (~700 characters, 100-character overlap).
  - High-dimensional vector embeddings with Google Gemini (`models/gemini-embedding-001`, 3072 dims).
- **Dual Vector Search (Atlas + Instant In-Memory Fallback)**:
  - Queries MongoDB Atlas via the `$vectorSearch` aggregation pipeline.
  - Features an in-memory NumPy cosine similarity fallback so newly uploaded documents are immediately queryable even while the Atlas index syncs.
- **Knowledge Base Management**:
  - `GET /api/documents` to view uploaded files, chunk counts, and upload timestamps.
  - `DELETE /api/documents/:id` to remove all chunks from both MongoDB and the in-memory store.
- **Perplexity / ChatGPT-Style SaaS UI**:
  - Collapsible left sidebar with drag-and-drop course material uploader.
  - Knowledge Base file list with one-click deletion.
  - Live system status indicators polling `/api/health` for both Gateway (Port 5000) and RAG Service (Port 8000).
  - Welcome state with 4 starter academic prompts.
  - Rich Markdown formatting with syntax-highlighted code blocks, lists, and headings.
  - One-click copy response button with feedback.
  - Expandable citation chips showing Document Name, Page Number, and Match Percentage.
  - Persistent **Light / Dark Mode Switcher** with smooth transitions.

---

## Project Structure

```
EduQuery-AI/
├── backend/                  # Node.js / Express API Gateway (Port 5000)
│   ├── src/
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── frontend/                 # React + Vite + Tailwind CSS SPA (Port 5173)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── rag-service/              # Python FastAPI RAG Microservice (Port 8000)
│   ├── .env.example
│   ├── main.py
│   └── requirements.txt
├── .gitignore                # Global ignore rules (excluding .env, node_modules, etc.)
└── README.md                 # Project documentation
```

---

## Getting Started

### 1. Configure Environment Variables

Create `.env` in `rag-service/` and `backend/`:

**`rag-service/.env`**:
```env
PORT=8000
GOOGLE_API_KEY=your_gemini_api_key_here
MONGODB_URI=your_mongodb_atlas_connection_string
```

**`backend/.env`**:
```env
PORT=5000
RAG_SERVICE_URL=http://localhost:8000
MONGODB_URI=your_mongodb_atlas_connection_string
```

---

### 2. Start the Services

Open three separate terminals:

#### Terminal 1 — Python RAG Service
```bash
cd rag-service
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8000
```

#### Terminal 2 — Node.js Express Gateway
```bash
cd backend
npm install
npm run dev
# Runs on http://localhost:5000
```

#### Terminal 3 — React Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## MongoDB Atlas Vector Search Index

On your MongoDB Atlas cluster (`eduquery.chunks`), create a Vector Search Index named `vector_index`:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 3072,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "documentId"
    }
  ]
}
```

---

## License

MIT
