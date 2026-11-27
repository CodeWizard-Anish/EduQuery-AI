const mongoose = require("mongoose");

const turnSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "assistant"],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  sources: [
    {
      documentId: String,
      filename: String,
      page: Number,
      score: Number,
      snippet: String,
    },
  ],
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    title: {
      type: String,
      default: "Academic Query",
      trim: true,
    },
    courseFilter: {
      type: String,
      default: null,
    },
    turns: [turnSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Conversation", conversationSchema);
