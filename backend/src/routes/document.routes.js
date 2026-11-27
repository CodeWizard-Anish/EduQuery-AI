const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const Document = require("../models/Document");
const { authMiddleware, requireRole, optionalAuth } = require("../middlewares/auth");

const router = express.Router();
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:8000";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
});

// GET /api/documents/courses (also accessible via /api/courses)
router.get("/courses", async (req, res) => {
  try {
    const coursesAgg = await Document.aggregate([
      { $match: { status: "READY" } },
      {
        $group: {
          _id: "$course",
          documentCount: { $sum: 1 },
          chunkCount: { $sum: "$chunkCount" },
          questionsArray: { $push: "$starterQuestions" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const courses = coursesAgg.map((item) => {
      const flattenedQuestions = (item.questionsArray || []).flat().filter(Boolean);
      const uniqueQuestions = Array.from(new Set(flattenedQuestions));
      return {
        course: item._id,
        documentCount: item.documentCount,
        chunkCount: item.chunkCount,
        starterQuestions: uniqueQuestions.slice(0, 5),
      };
    });

    return res.status(200).json(courses);
  } catch (error) {
    console.error("[Get Courses Error]:", error);
    return res.status(500).json({ error: "Failed to retrieve courses.", details: error.message });
  }
});

// POST /api/documents (Upload with metadata + trigger ingestion - STRICT FACULTY / ADMIN)
router.post("/", authMiddleware, requireRole("faculty", "admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File attachment is required (.pdf, .txt, .md)." });
    }

    const title = req.body.title || req.file.originalname;
    const course = req.body.course ? req.body.course.trim() : "General";
    const unit = req.body.unit ? req.body.unit.trim() : "General";

    let tags = [];
    if (req.body.tags) {
      tags = Array.isArray(req.body.tags)
        ? req.body.tags
        : req.body.tags.split(",").map((t) => t.trim()).filter(Boolean);
    }

    // 1. Prevent duplicate entries for same filename + course
    const existing = await Document.findOne({
      filename: req.file.originalname,
      course: course,
      status: "READY",
    });
    if (existing) {
      return res.status(409).json({
        error: `A document with filename "${req.file.originalname}" already exists for course "${course}". Please delete the existing document first or rename the file.`,
        existingDocumentId: existing._id,
      });
    }

    // 2. Generate prospective MongoDB ObjectId for atomic correlation
    const docId = new mongoose.Types.ObjectId();

    // 3. Forward file & metadata to Python RAG service /ingest FIRST
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append("file", blob, req.file.originalname);
    formData.append("documentId", docId.toString());
    formData.append("title", title);
    formData.append("course", course);
    formData.append("unit", unit);

    let ragResponse;
    let ragData;
    try {
      ragResponse = await fetch(`${RAG_SERVICE_URL}/ingest`, {
        method: "POST",
        body: formData,
      });
      ragData = await ragResponse.json().catch(() => ({}));
    } catch (ingestErr) {
      console.error("[RAG Ingestion Network Error]:", ingestErr.message);
      return res.status(502).json({
        error: `Could not reach RAG service: ${ingestErr.message}`,
      });
    }

    // 4. Strict Validation: If RAG failed or 0 chunks, insert NOTHING into MongoDB
    if (!ragResponse.ok || !ragData.chunkCount || ragData.chunkCount <= 0) {
      const errorMsg =
        ragData.detail ||
        ragData.error ||
        "No readable text found in this file. Scanned/image-only PDFs aren't supported yet — OCR coming in v2.";
      return res.status(ragResponse.status || 400).json({
        error: errorMsg,
      });
    }

    // 5. Atomic persistence: Only create Document record in MongoDB AFTER chunks are confirmed
    const docRecord = await Document.create({
      _id: docId,
      title: title.trim(),
      course: course,
      unit: unit,
      tags,
      filename: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
      uploadedByName: req.user.name || "Dr. Anish",
      status: "READY",
      chunkCount: ragData.chunkCount,
      views: 0,
      starterQuestions: ragData.starterQuestions || [],
    });

    return res.status(201).json({
      documentId: docRecord._id.toString(),
      title: docRecord.title,
      course: docRecord.course,
      unit: docRecord.unit,
      filename: docRecord.filename,
      status: docRecord.status,
      chunkCount: docRecord.chunkCount,
      views: docRecord.views || 0,
      starterQuestions: docRecord.starterQuestions,
      uploadedByName: docRecord.uploadedByName,
      createdAt: docRecord.createdAt,
    });
  } catch (error) {
    console.error("[Document Upload Error]:", error);
    return res.status(500).json({ error: "Document upload failed.", details: error.message });
  }
});

// POST /api/documents/:documentId/view (Increment views counter on preview/details)
router.post("/:documentId/view", optionalAuth, async (req, res) => {
  try {
    const { documentId } = req.params;
    const doc = await Document.findByIdAndUpdate(
      documentId,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }
    return res.status(200).json({ status: "success", documentId, views: doc.views || 0 });
  } catch (error) {
    console.error("[Document View Error]:", error);
    return res.status(500).json({ error: "Failed to record document view." });
  }
});

// GET /api/documents (List documents, filterable by course/status)
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.course && req.query.course.toLowerCase() !== "all courses") {
      filter.course = req.query.course;
    }
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const docs = await Document.find(filter)
      .sort({ createdAt: -1 })
      .populate("uploadedBy", "name email role department");

    return res.status(200).json(
      docs.map((d) => ({
        documentId: d._id.toString(),
        title: d.title,
        course: d.course,
        unit: d.unit || "General",
        tags: d.tags,
        filename: d.filename,
        fileSize: d.fileSize,
        status: d.status,
        chunkCount: d.chunkCount,
        views: d.views || 0,
        starterQuestions: d.starterQuestions || [],
        error: d.error,
        uploadedByName: d.uploadedByName || (d.uploadedBy ? d.uploadedBy.name : "Faculty / Admin"),
        uploadedBy: d.uploadedBy
          ? { name: d.uploadedBy.name, email: d.uploadedBy.email, department: d.uploadedBy.department }
          : null,
        createdAt: d.createdAt,
      }))
    );
  } catch (error) {
    console.error("[Get Documents Error]:", error);
    try {
      const ragFallback = await fetch(`${RAG_SERVICE_URL}/documents`);
      const ragData = await ragFallback.json();
      return res.status(200).json(ragData);
    } catch {
      return res.status(500).json({ error: "Failed to load documents." });
    }
  }
});

// GET /api/documents/:id (Get single document status)
router.get("/:id", async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }

    return res.status(200).json({
      documentId: doc._id.toString(),
      title: doc.title,
      course: doc.course,
      unit: doc.unit,
      status: doc.status,
      chunkCount: doc.chunkCount,
      starterQuestions: doc.starterQuestions || [],
      uploadedByName: doc.uploadedByName,
      error: doc.error,
      createdAt: doc.createdAt,
    });
  } catch (error) {
    return res.status(400).json({ error: "Invalid document ID." });
  }
});

// DELETE /api/documents/:id (Delete document - STRICT FACULTY / ADMIN)
router.delete("/:id", authMiddleware, requireRole("faculty", "admin"), async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      // Also purge from RAG service in case it's in in-memory store
      await fetch(`${RAG_SERVICE_URL}/documents/${req.params.id}`, { method: "DELETE" }).catch(() => {});
      return res.status(200).json({ status: "deleted", documentId: req.params.id });
    }

    // Call RAG service to purge vector chunks & invalidate query cache
    await fetch(`${RAG_SERVICE_URL}/documents/${doc._id.toString()}`, {
      method: "DELETE",
    }).catch((e) => console.warn("RAG purge warning:", e.message));

    await Document.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      status: "deleted",
      documentId: req.params.id,
      title: doc.title,
    });
  } catch (error) {
    console.error("[Delete Document Error]:", error);
    return res.status(500).json({ error: "Failed to delete document.", details: error.message });
  }
});

module.exports = router;
