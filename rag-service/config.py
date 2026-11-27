from pathlib import Path
import os
import logging
from dotenv import load_dotenv
import pymongo
import google.generativeai as genai

# Setup paths and load environment variables
service_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=service_dir / ".env")
load_dotenv(dotenv_path=service_dir.parent / "backend" / ".env")
load_dotenv(dotenv_path=service_dir.parent / ".env")
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("rag-service")

# Keys and URIs
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MONGO_URI = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI")
PORT = int(os.getenv("PORT", 8000))

# Gemini SDK Configuration
if GEMINI_API_KEY:
    os.environ["GOOGLE_API_KEY"] = GEMINI_API_KEY
    os.environ["GEMINI_API_KEY"] = GEMINI_API_KEY
    genai.configure(api_key=GEMINI_API_KEY, transport="rest")
    logger.info("Gemini configured successfully with REST transport.")
else:
    logger.error("No Gemini API key found in environment!")

if GROQ_API_KEY:
    logger.info("Groq API key configured for high-throughput fallback generation.")
else:
    logger.info("Groq API key not set (optional fallback).")

# MongoDB Connection
mongo_client = None
chunks_collection = None
documents_collection = None

if MONGO_URI:
    try:
        mongo_client = pymongo.MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5000,
            socketTimeoutMS=10000
        )
        db = mongo_client.get_database("eduquery")
        chunks_collection = db.get_collection("chunks")
        documents_collection = db.get_collection("documents")
        logger.info("Connected to MongoDB Atlas (eduquery).")
    except Exception as e:
        logger.error(f"MongoDB connection error: {e}")

# Constants
EMBEDDING_MODEL = "models/gemini-embedding-001"
GENERATION_MODELS = [
    "models/gemini-3.5-flash-lite",
    "models/gemini-3.1-flash-lite",
    "models/gemini-3.6-flash",
    "models/gemini-3-flash-preview",
]
GROQ_FALLBACK_MODELS = [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
]
SIMILARITY_THRESHOLD = 0.40
