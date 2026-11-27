const mongoose = require("mongoose");

const queryLogSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      trim: true,
    },
    course: {
      type: String,
      default: "All Courses",
      index: true,
    },
    conversationId: {
      type: String,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    userRole: {
      type: String,
      default: "guest",
    },
    grounded: {
      type: Boolean,
      default: true,
    },
    topScore: {
      type: Number,
      default: null,
    },
    sourcesCount: {
      type: Number,
      default: 0,
    },
    feedback: {
      type: String,
      enum: ["like", "dislike", null],
      default: null,
    },
    feedbackComment: {
      type: String,
      default: "",
    },
    cached: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("QueryLog", queryLogSchema);
