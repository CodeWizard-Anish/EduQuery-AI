const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:8000";

// Configure Multer for in-memory file staging
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
});

// Middleware
app.use(cors());
app.use(express.json());

// 1. Health check endpoint (probes both Gateway and RAG service)
app.get("/api/health", async (req, res) => {
  let ragStatus = "offline";
  let ragDetails = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const ragRes = await fetch(`${RAG_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (ragRes.ok) {
      ragStatus = "online";
      ragDetails = await ragRes.json();
    }
  } catch (err) {
    ragStatus = "offline";
  }

  res.json({
    status: "ok",
    gateway: "online",
    ragService: ragStatus,
    ragDetails,
  });
});

// 2. POST /api/upload -> Forwards file to Python RAG /ingest
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file was attached to the request." });
    }

    // Build standard multipart/form-data payload via native Fetch FormData
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append("file", blob, req.file.originalname);

    const ragResponse = await fetch(`${RAG_SERVICE_URL}/ingest`, {
      method: "POST",
      body: formData,
    });

    const data = await ragResponse.json().catch(() => ({}));
    if (!ragResponse.ok) {
      console.error(`[RAG Ingest Error ${ragResponse.status}]:`, data);
      return res.status(ragResponse.status).json({
        error: data.detail || "RAG service failed to ingest document.",
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("[Upload Gateway Error]:", error);
    return res.status(502).json({
      error: "Unable to forward document to RAG microservice. Verify it is running on port 8000.",
      details: error.message,
    });
  }
});

// 3. GET /api/documents -> Proxies to Python RAG /documents
app.get("/api/documents", async (req, res) => {
  try {
    const ragResponse = await fetch(`${RAG_SERVICE_URL}/documents`);
    const data = await ragResponse.json().catch(() => []);
    if (!ragResponse.ok) {
      return res.status(ragResponse.status).json({
        error: data.detail || "Failed to retrieve documents from RAG service.",
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("[Documents Gateway Error]:", error);
    return res.status(502).json({
      error: "Unable to reach RAG service to fetch documents.",
      details: error.message,
    });
  }
});

// 4. DELETE /api/documents/:documentId -> Proxies to Python RAG /documents/{document_id}
app.delete("/api/documents/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;
    const ragResponse = await fetch(`${RAG_SERVICE_URL}/documents/${documentId}`, {
      method: "DELETE",
    });
    const data = await ragResponse.json().catch(() => ({}));
    if (!ragResponse.ok) {
      return res.status(ragResponse.status).json({
        error: data.detail || "Failed to delete document from RAG service.",
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("[Delete Gateway Error]:", error);
    return res.status(502).json({
      error: "Unable to reach RAG service to delete document.",
      details: error.message,
    });
  }
});

// 5. POST /api/chat -> Forwards user query to Python RAG /retrieve-and-generate
app.post("/api/chat", async (req, res) => {
  try {
    const { query, question, message, top_k } = req.body;
    const userQuery = query || question || message;

    if (!userQuery || !userQuery.trim()) {
      return res.status(400).json({ error: "Query parameter cannot be empty." });
    }

    const response = await fetch(`${RAG_SERVICE_URL}/retrieve-and-generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: userQuery.trim(),
        top_k: top_k || 5,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`[RAG Service Error ${response.status}]:`, data);
      return res.status(response.status).json({
        error: data.detail || "RAG service failed to generate an answer.",
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("[Chat Gateway Error]:", error);
    return res.status(502).json({
      error: "Unable to reach RAG microservice. Ensure it is running on port 8000.",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`EduQuery Node.js Gateway running on http://localhost:${PORT}`);
  console.log(`Targeting RAG Microservice at: ${RAG_SERVICE_URL}`);
});
