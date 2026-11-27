const express = require("express");
const Conversation = require("../models/Conversation");
const Document = require("../models/Document");
const QueryLog = require("../models/QueryLog");
const StudentSession = require("../models/StudentSession");
const User = require("../models/User");
const { optionalAuth, authMiddleware, requireRole } = require("../middlewares/auth");

const router = express.Router();
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:8000";

// POST /api/chat/query (and alias /api/chat)
router.post(["/query", "/"], optionalAuth, async (req, res) => {
  try {
    const { question, query, message, conversationId, courseFilter, topK } = req.body;
    const userQuery = question || query || message;

    if (!userQuery || !userQuery.trim()) {
      return res.status(400).json({ error: "Query or question parameter is required." });
    }

    let conversation = null;
    let historyTurns = [];

    // 1. Fetch recent turns if conversationId is provided
    if (conversationId) {
      try {
        conversation = await Conversation.findById(conversationId);
        if (conversation && conversation.turns) {
          // Take up to 6 recent turns to supply multi-turn context
          historyTurns = conversation.turns.slice(-6).map((t) => ({
            role: t.role,
            content: t.content,
          }));
        }
      } catch (err) {
        console.warn("[Conversation lookup warn]:", err.message);
      }
    }

    // 2. Call Python RAG Microservice /query (or fallback /retrieve-and-generate)
    const ragPayload = {
      question: userQuery.trim(),
      query: userQuery.trim(),
      history: historyTurns,
      topK: topK || 5,
      filters: courseFilter && courseFilter !== "All Courses" ? { course: courseFilter } : {},
      courseFilter: courseFilter && courseFilter !== "All Courses" ? courseFilter : null,
    };

    let ragResponse;
    try {
      ragResponse = await fetch(`${RAG_SERVICE_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ragPayload),
        signal: AbortSignal.timeout(75000),
      });

      // Fallback to /retrieve-and-generate if needed
      if (ragResponse.status === 404) {
        ragResponse = await fetch(`${RAG_SERVICE_URL}/retrieve-and-generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: userQuery.trim(), top_k: topK || 5 }),
          signal: AbortSignal.timeout(75000),
        });
      }
    } catch (networkErr) {
      if (networkErr.name === "TimeoutError" || networkErr.name === "AbortError") {
        return res.status(504).json({
          error: "RAG service timed out. Please try again.",
        });
      }
      return res.status(502).json({
        error: "Unable to reach RAG microservice. Ensure it is running on port 8000.",
        details: networkErr.message,
      });
    }

    const data = await ragResponse.json().catch(() => ({}));
    if (!ragResponse.ok) {
      return res.status(ragResponse.status).json({
        error: data.detail || data.error || "RAG service failed to generate an answer.",
        status: ragResponse.status,
      });
    }

    const answer = data.answer || "No response generated.";
    const sources = data.sources || [];
    const grounded = data.grounded !== undefined ? data.grounded : sources.length > 0;
    const tokensUsed = data.tokensUsed || null;
    const cached = Boolean(data.cached);
    const emptyKnowledgeBase = Boolean(data.empty_knowledge_base);

    // 3. Persist conversation turn
    const userTurn = { role: "user", content: userQuery.trim(), timestamp: new Date() };
    const assistantTurn = {
      role: "assistant",
      content: answer,
      sources: sources.map((s) => ({
        documentId: s.document_id || s.documentId,
        filename: s.filename,
        course: s.course,
        page: s.page,
        score: s.score,
        snippet: s.snippet,
      })),
      timestamp: new Date(),
    };

    let savedConvId = conversationId;

    try {
      if (conversation) {
        conversation.turns.push(userTurn, assistantTurn);
        if (courseFilter && !conversation.courseFilter) {
          conversation.courseFilter = courseFilter;
        }
        await conversation.save();
        savedConvId = conversation._id.toString();
      } else if (req.user || req.body.saveConversation) {
        // Auto-create new conversation
        const titleSnippet = userQuery.trim().slice(0, 45) + (userQuery.length > 45 ? "..." : "");
        const newConv = await Conversation.create({
          userId: req.user ? req.user._id : null,
          title: titleSnippet,
          courseFilter: courseFilter || null,
          turns: [userTurn, assistantTurn],
        });
        savedConvId = newConv._id.toString();
      }
    } catch (convSaveErr) {
      console.warn("[Conversation save warn]:", convSaveErr.message);
    }

    // 4. Log Query for Faculty Analytics & Student History
    let logId = null;
    try {
      const logRecord = await QueryLog.create({
        query: userQuery.trim(),
        course: courseFilter || "All Courses",
        conversationId: savedConvId,
        userId: req.user ? req.user._id : null,
        userRole: req.user ? req.user.role : "student",
        grounded,
        topScore: sources.length > 0 && sources[0].score !== undefined ? sources[0].score : null,
        sourcesCount: sources.length,
        cached,
      });
      logId = logRecord._id.toString();
    } catch (logErr) {
      console.warn("[Query logging error]:", logErr.message);
    }

    return res.status(200).json({
      conversationId: savedConvId,
      queryLogId: logId,
      answer,
      sources,
      grounded,
      cached,
      emptyKnowledgeBase,
      model_used: data.model_used || null,
      tokensUsed,
    });
  } catch (error) {
    console.error("[Chat Gateway Error]:", error);
    return res.status(500).json({ error: "Failed to process chat query.", details: error.message });
  }
});

// POST /api/chat/feedback (and alias /api/feedback)
router.post("/feedback", optionalAuth, async (req, res) => {
  try {
    const { queryLogId, conversationId, query, course, feedback, feedbackComment } = req.body;

    if (!feedback || !["like", "dislike"].includes(feedback)) {
      return res.status(400).json({ error: "Feedback must be 'like' or 'dislike'." });
    }

    let updated = null;
    if (queryLogId) {
      updated = await QueryLog.findByIdAndUpdate(
        queryLogId,
        { feedback, feedbackComment: feedbackComment || "" },
        { new: true }
      );
    }

    if (!updated && conversationId) {
      // Find the most recent log for this conversation
      updated = await QueryLog.findOneAndUpdate(
        { conversationId },
        { feedback, feedbackComment: feedbackComment || "" },
        { sort: { createdAt: -1 }, new: true }
      );
    }

    if (!updated && query) {
      updated = await QueryLog.create({
        query: query.trim(),
        course: course || "All Courses",
        conversationId: conversationId || null,
        userId: req.user ? req.user._id : null,
        userRole: req.user ? req.user.role : "student",
        feedback,
        feedbackComment: feedbackComment || "",
      });
    }

    return res.status(200).json({ status: "success", feedback, queryLogId: updated ? updated._id : null });
  } catch (error) {
    console.error("[Feedback Error]:", error);
    return res.status(500).json({ error: "Failed to record feedback." });
  }
});

// POST /api/chat/visit (and alias /api/analytics/visit - Tracks unique student sessions)
router.post(["/visit", "/analytics/visit"], optionalAuth, async (req, res) => {
  try {
    const { sessionId, role, userId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }
    const sessionRole = role || (req.user ? req.user.role : "student");
    const sessionUserId = req.user ? req.user._id : (userId || null);

    const session = await StudentSession.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          lastActiveAt: new Date(),
          role: sessionRole,
          ...(sessionUserId ? { userId: sessionUserId } : {}),
        },
        $inc: { visitCount: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ status: "recorded", session });
  } catch (error) {
    console.error("[Visit Track Error]:", error);
    return res.status(500).json({ error: "Failed to record session visit." });
  }
});

// GET /api/chat/analytics (and alias /api/analytics - STRICT FACULTY / ADMIN)
router.get(["/analytics", "/"], authMiddleware, requireRole("faculty", "admin"), async (req, res) => {
  try {
    // 1. Total counts & Engagement
    const totalQueries = await QueryLog.countDocuments();
    const readyDocs = await Document.find({ status: "READY" });
    const totalDocuments = readyDocs.length;
    const totalChunks = readyDocs.reduce((acc, d) => acc + (d.chunkCount || 0), 0);
    const totalDocumentViews = readyDocs.reduce((acc, d) => acc + (d.views || 0), 0);

    // Unique students: count of unique student sessions + unique registered student accounts
    const studentSessionCount = await StudentSession.countDocuments({ role: "student" });
    const registeredStudentCount = await User.countDocuments({ role: "student" });
    const uniqueStudents = Math.max(studentSessionCount, registeredStudentCount, 1);

    // 2. Feedback stats & Satisfaction Rate
    const totalRated = await QueryLog.countDocuments({ feedback: { $ne: null } });
    const totalLikes = await QueryLog.countDocuments({ feedback: "like" });
    const satisfactionRate = totalRated > 0 ? Math.round((totalLikes / totalRated) * 100) : 100;

    // 3. Top queried courses
    const courseStats = await QueryLog.aggregate([
      { $group: { _id: "$course", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]);

    // 4. Document stats (Title, Course, Chunks, Views, UploadedBy)
    const documentStats = readyDocs.map((d) => ({
      id: d._id.toString(),
      title: d.title,
      course: d.course,
      unit: d.unit || "General",
      chunkCount: d.chunkCount || 0,
      views: d.views || 0,
      uploadedByName: d.uploadedByName || "Dr. Anish",
      createdAt: d.createdAt,
    }));

    // 5. Recent queries with user feedback
    const recentQueries = await QueryLog.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("userId", "name email");

    // 6. Unanswered or disliked queries (Student struggles)
    const strugglingQueries = await QueryLog.find({
      $or: [{ grounded: false }, { feedback: "dislike" }],
    })
      .sort({ createdAt: -1 })
      .limit(10);

    return res.status(200).json({
      uniqueStudents,
      totalDocumentViews,
      totalQueries,
      satisfactionRate,
      positiveFeedbackRate: satisfactionRate,
      totalDocuments,
      totalChunks,
      topCourses: courseStats.map((c) => ({ course: c._id || "General", count: c.count })),
      documentStats,
      recentQueries: recentQueries.map((q) => ({
        id: q._id.toString(),
        query: q.query,
        course: q.course,
        grounded: q.grounded,
        feedback: q.feedback,
        cached: q.cached,
        createdAt: q.createdAt,
      })),
      strugglingQueries: strugglingQueries.map((q) => ({
        id: q._id.toString(),
        query: q.query,
        course: q.course,
        grounded: q.grounded,
        feedback: q.feedback,
        feedbackComment: q.feedbackComment,
        createdAt: q.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Analytics Error]:", error);
    return res.status(500).json({ error: "Failed to load analytics.", details: error.message });
  }
});

// GET /api/chat/conversations (List user's conversations)
router.get("/conversations", optionalAuth, async (req, res) => {
  try {
    const query = req.user ? { userId: req.user._id } : { userId: null };
    const convs = await Conversation.find(query)
      .sort({ updatedAt: -1 })
      .select("_id title courseFilter updatedAt createdAt turns")
      .limit(30);

    return res.status(200).json(
      convs.map((c) => ({
        id: c._id.toString(),
        title: c.title,
        courseFilter: c.courseFilter,
        turnCount: c.turns.length,
        updatedAt: c.updatedAt,
      }))
    );
  } catch (error) {
    return res.status(500).json({ error: "Could not fetch conversations." });
  }
});

// GET /api/chat/conversations/:id (Get full conversation turns)
router.get("/conversations/:id", async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    return res.status(200).json({
      id: conv._id.toString(),
      title: conv.title,
      courseFilter: conv.courseFilter,
      turns: conv.turns,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    });
  } catch (error) {
    return res.status(400).json({ error: "Invalid conversation ID." });
  }
});

// DELETE /api/chat/conversations/:id
router.delete("/conversations/:id", async (req, res) => {
  try {
    await Conversation.findByIdAndDelete(req.params.id);
    return res.status(200).json({ status: "deleted", id: req.params.id });
  } catch (error) {
    return res.status(400).json({ error: "Could not delete conversation." });
  }
});

module.exports = router;
