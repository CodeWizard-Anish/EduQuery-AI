const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./src/config/db");

dotenv.config();

// Connect to MongoDB Atlas, seed faculty account & perform startup cleanup
connectDB().then(async () => {
  try {
    const seedFacultyUser = require("./src/config/seed");
    await seedFacultyUser();

    // 1. One-time Startup Cleanup: Remove broken ghost documents with <= 0 chunks or non-READY status
    const Document = require("./src/models/Document");
    const cleanupResult = await Document.deleteMany({
      $or: [
        { chunkCount: { $lte: 0 } },
        { chunkCount: null },
        { status: { $ne: "READY" } },
      ],
    });
    if (cleanupResult.deletedCount > 0) {
      console.log(`[Startup Cleanup] Purged ${cleanupResult.deletedCount} broken ghost documents.`);
    }

    // 2. Global DB migration: Rename any existing "Dr. Anish Sharma" entries to "Dr. Anish"
    const mongoose = require("mongoose");
    const db = mongoose.connection.db;
    if (db) {
      await db.collection("users").updateMany(
        { name: "Dr. Anish Sharma" },
        { $set: { name: "Dr. Anish" } }
      );
      await db.collection("documents").updateMany(
        { uploadedByName: "Dr. Anish Sharma" },
        { $set: { uploadedByName: "Dr. Anish" } }
      );
      await db.collection("chunks").updateMany(
        { uploadedByName: "Dr. Anish Sharma" },
        { $set: { uploadedByName: "Dr. Anish" } }
      );
      console.log("[Startup Migration] Verified all user and document records reflect 'Dr. Anish'.");
    }
  } catch (startupErr) {
    console.warn("[Startup Initialization Notice]:", startupErr.message);
  }
});

const app = express();
const PORT = process.env.PORT || 5000;
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:8000";

// Security & Parsing Middlewares
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Route Blueprints
const authRoutes = require("./src/routes/auth.routes");
const documentRoutes = require("./src/routes/document.routes");
const chatRoutes = require("./src/routes/chat.routes");

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/conversations", chatRoutes); // Convenient alias

// Top-level aliases for direct frontend convenience
app.use("/api/courses", (req, res, next) => {
  req.url = "/courses" + (req.url === "/" ? "" : req.url);
  documentRoutes(req, res, next);
});

app.use("/api/analytics", (req, res, next) => {
  req.url = "/analytics" + (req.url === "/" ? "" : req.url);
  chatRoutes(req, res, next);
});

app.use("/api/feedback", (req, res, next) => {
  req.url = "/feedback" + (req.url === "/" ? "" : req.url);
  chatRoutes(req, res, next);
});

// Backward-compatibility: direct POST /api/upload
app.post("/api/upload", (req, res, next) => {
  req.url = "/";
  documentRoutes(req, res, next);
});

// Dual System Health Check Endpoint
app.get("/api/health", async (req, res) => {
  let ragStatus = "offline";
  let ragDetails = null;

  try {
    const ragRes = await fetch(`${RAG_SERVICE_URL}/health`, { signal: AbortSignal.timeout(4000) });
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
    timestamp: new Date().toISOString(),
  });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("[Unhandled Express Error]:", err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error occurred.",
    code: err.code || "INTERNAL_ERROR",
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`EduQuery Node.js API Gateway live on http://localhost:${PORT}`);
  console.log(`Routing internal RAG requests to: ${RAG_SERVICE_URL}`);
  console.log(`====================================================`);
});
