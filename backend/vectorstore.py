"""
vectorstore.py
Minimal in-memory vector database. No external service required —
good enough for a demo with a handful of documents, and easy to read.
Swap this class out for FAISS / Qdrant / Pinecone in a production build.
"""
from dataclasses import dataclass, field
from typing import List, Optional, Dict
import numpy as np
import uuid
import time


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    text: str
    position: int


@dataclass
class DocumentRecord:
    doc_id: str
    filename: str
    doc_type: str
    summary: str
    key_entities: List[str]
    confidence: float
    num_chunks: int
    uploaded_at: float = field(default_factory=time.time)


class VectorStore:
    """A single global store shared by all requests (demo scope)."""

    def __init__(self):
        self._documents: Dict[str, DocumentRecord] = {}
        self._chunks: Dict[str, List[Chunk]] = {}       # doc_id -> chunks
        self._vectors: Dict[str, np.ndarray] = {}        # doc_id -> (N, D) matrix

    # ---------- writes ----------

    def add_document(
        self,
        filename: str,
        doc_type: str,
        summary: str,
        key_entities: List[str],
        confidence: float,
        chunk_texts: List[str],
        chunk_vectors: np.ndarray,
    ) -> DocumentRecord:
        doc_id = str(uuid.uuid4())[:8]

        record = DocumentRecord(
            doc_id=doc_id,
            filename=filename,
            doc_type=doc_type,
            summary=summary,
            key_entities=key_entities,
            confidence=confidence,
            num_chunks=len(chunk_texts),
        )
        self._documents[doc_id] = record

        chunks = [
            Chunk(chunk_id=f"{doc_id}-{i}", doc_id=doc_id, text=t, position=i)
            for i, t in enumerate(chunk_texts)
        ]
        self._chunks[doc_id] = chunks
        self._vectors[doc_id] = chunk_vectors

        return record

    def delete_document(self, doc_id: str) -> bool:
        if doc_id not in self._documents:
            return False
        del self._documents[doc_id]
        del self._chunks[doc_id]
        del self._vectors[doc_id]
        return True

    # ---------- reads ----------

    def list_documents(self) -> List[DocumentRecord]:
        return sorted(self._documents.values(), key=lambda d: d.uploaded_at, reverse=True)

    def get_document(self, doc_id: str) -> Optional[DocumentRecord]:
        return self._documents.get(doc_id)

    def search(
        self,
        query_vector: np.ndarray,
        doc_id: Optional[str] = None,
        top_k: int = 5,
    ):
        """
        Cosine-similarity search. If doc_id is None (or "all"), searches
        across every uploaded document; otherwise scoped to one document.
        """
        target_doc_ids = [doc_id] if doc_id and doc_id != "all" else list(self._documents.keys())

        results = []
        for did in target_doc_ids:
            vectors = self._vectors.get(did)
            chunks = self._chunks.get(did)
            if vectors is None or vectors.shape[0] == 0:
                continue

            sims = _cosine_similarity(query_vector, vectors)
            for idx, score in enumerate(sims):
                results.append((float(score), chunks[idx]))

        if not results:
            return []

        results.sort(key=lambda x: x[0], reverse=True)

        MIN_SCORE = 0.45
        results = [r for r in results if r[0] >= MIN_SCORE]

        return results[:top_k]


def _cosine_similarity(query_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    q_norm = query_vec / (np.linalg.norm(query_vec) + 1e-10)
    m_norm = matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-10)
    return m_norm @ q_norm


# Single shared instance imported by the API layer
store = VectorStore()
