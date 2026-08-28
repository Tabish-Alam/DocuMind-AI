"""
main.py
Document Intelligence + RAG demo API.

Flow per upload:
  file bytes -> extract_text -> chunk_text -> embed_texts (local, fastembed)
  -> classify_document (Groq LLM) -> stored in in-memory VectorStore

Flow per chat message:
  question -> embed_query -> vector search -> Groq LLM answers using
  retrieved chunks only, with inline citations.

The visitor's Groq API key is sent per-request via the X-Groq-Api-Key
header and is never persisted server-side.
"""
import os
from typing import Optional, List

from fastapi import FastAPI, UploadFile, File, Header, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from extraction import extract_text, ExtractionError
from chunking import chunk_text
from embeddings import embed_texts
from classifier import classify_document
from vectorstore import store
from groq_client import GroqError
from rag import answer_question

app = FastAPI(title="Document Intelligence + RAG Demo")


def _load_env_file() -> None:
    """Load key=value pairs from a local .env file if present."""
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    env_paths = [
        os.path.join(project_root, ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
    ]

    for env_path in env_paths:
        if not os.path.isfile(env_path):
            continue

        with open(env_path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue

                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")

                if key and key not in os.environ:
                    os.environ[key] = value


_load_env_file()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE_MB = 15


def require_api_key(x_groq_api_key: Optional[str]) -> str:
    api_key = (x_groq_api_key or os.getenv("GROQ_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key.",
        )
    return api_key


# ---------------------------------------------------------------------------
# API models
# ---------------------------------------------------------------------------

class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    doc_id: Optional[str] = "all"
    history: Optional[List[ChatTurn]] = None


# ---------------------------------------------------------------------------
# Document endpoints
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...),
    x_groq_api_key: Optional[str] = Header(None),
):
    api_key = require_api_key(x_groq_api_key)

    if file.size and file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large. Max size is {MAX_FILE_SIZE_MB}MB.")

    file_bytes = await file.read()

    try:
        text = extract_text(file_bytes, file.filename)
    except ExtractionError as exc:
        raise HTTPException(400, str(exc)) from exc

    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(400, "No usable text could be extracted from this file.")

    try:
        classification = classify_document(text, api_key)
        vectors = embed_texts(chunks)
    except GroqError as exc:
        message = str(exc).lower()
        status_code = 429 if "rate limit" in message else 401
        raise HTTPException(status_code, "Missing API key.") from exc

    record = store.add_document(
        filename=file.filename,
        doc_type=classification["document_type"],
        summary=classification["summary"],
        key_entities=classification["key_entities"],
        confidence=classification["confidence"],
        chunk_texts=chunks,
        chunk_vectors=vectors,
    )

    return {
        "doc_id": record.doc_id,
        "filename": record.filename,
        "document_type": record.doc_type,
        "summary": record.summary,
        "key_entities": record.key_entities,
        "confidence": record.confidence,
        "num_chunks": record.num_chunks,
    }


@app.get("/api/documents")
async def list_documents():
    docs = store.list_documents()
    return [
        {
            "doc_id": d.doc_id,
            "filename": d.filename,
            "document_type": d.doc_type,
            "summary": d.summary,
            "key_entities": d.key_entities,
            "confidence": d.confidence,
            "num_chunks": d.num_chunks,
        }
        for d in docs
    ]


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    if not store.delete_document(doc_id):
        raise HTTPException(404, "Document not found.")
    return {"deleted": doc_id}


# ---------------------------------------------------------------------------
# RAG chat endpoint
# ---------------------------------------------------------------------------

@app.post("/api/chat")
async def chat(
    body: ChatRequest,
    x_groq_api_key: Optional[str] = Header(None),
):
    api_key = require_api_key(x_groq_api_key)

    if not body.message or not body.message.strip():
        raise HTTPException(400, "Message cannot be empty.")

    history = [t.dict() for t in body.history] if body.history else []

    try:
        result = answer_question(
            question=body.message.strip(),
            api_key=api_key,
            doc_id=body.doc_id,
            chat_history=history,
        )
    except GroqError as exc:
        message = str(exc)
        status_code = 429 if "rate limit" in message.lower() else 401
        raise HTTPException(status_code, "Missing API key.") from exc

    return result


@app.get("/api/health")
async def health():
    return {"status": "ok", "documents_indexed": len(store.list_documents())}


# ---------------------------------------------------------------------------
# Serve the frontend (single-deploy: API + static UI from one process)
# ---------------------------------------------------------------------------

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

# Mounted last so it never shadows the /api/* routes above; html=True lets
# it serve index.html at "/" and resolve style.css / app.js as siblings.
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
