const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    console.warn("[MongoDB Warning] MONGODB_URI not found in environment. Database features will be limited.");
    return;
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      dbName: "eduquery",
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB Connected] Host: ${conn.connection.host}, Database: ${conn.connection.name}`);
  } catch (error) {
    console.error("[MongoDB Connection Error]:", error.message);
  }
};

module.exports = connectDB;
