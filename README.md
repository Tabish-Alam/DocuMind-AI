# DocuMind AI

AI-powered Document Intelligence & Retrieval-Augmented Generation (RAG) platform.

Upload documents, automatically classify and index them, then chat with your documents using semantic search and LLM-powered question answering.

---

## Features

* PDF, DOCX, and TXT document support
* Automatic document classification
* Structured information extraction
* Semantic search using vector embeddings
* Retrieval-Augmented Generation (RAG)
* Source-grounded answers
* Multi-document querying
* Clean and responsive web interface

---

## Tech Stack

| Layer        | Technology                |
| ------------ | ------------------------- |
| Backend      | FastAPI                   |
| LLM          | Groq                      |
| Embeddings   | FastEmbed (BGE Small)     |
| Vector Store | In-Memory Vector Database |
| Frontend     | HTML, CSS, JavaScript     |
| Deployment   | Docker                    |

---

## Architecture

```text
Document Upload
      ↓
Text Extraction
      ↓
Chunking
      ↓
Embeddings
      ↓
Vector Store
      ↓
Semantic Retrieval
      ↓
Groq LLM
      ↓
Grounded Response
```

---

## Project Structure

```text
backend/
├── extraction.py
├── chunking.py
├── embeddings.py
├── classifier.py
├── vectorstore.py
├── rag.py

frontend/
├── index.html
├── style.css
├── app.js
```

---

## Run Locally

```bash
git clone https://github.com/Tabish-Alam/DocuMind-AI.git

cd DocuMind-AI

pip install -r requirements.txt

uvicorn main:app --reload
```

Open:

```text
http://localhost:8000
```

---

## Demo

Add your Groq API key, upload a document, and start asking questions.

### Example Queries

* What type of document is this?
* Summarize this document.
* What are the key requirements?
* Explain the implementation plan.
* What dates or entities are mentioned?

---

## Future Enhancements

* Persistent vector database (ChromaDB, Qdrant, Pinecone)
* OCR support for scanned PDFs
* Multi-user authentication
* Cloud deployment
* Advanced document analytics
* Hybrid search (keyword + semantic retrieval)

---

**Built by Tabish Alam with FastAPI, Groq, and FastEmbed**

