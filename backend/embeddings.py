"""
embeddings.py
Local embedding generation via fastembed (ONNX runtime, CPU-friendly,
no GPU / torch required). Groq does not expose an embeddings endpoint,
so retrieval uses this local model while generation uses Groq's LLMs.

Model weights (~130MB) download once on first use and are cached on disk.
"""
from typing import List
import numpy as np
from fastembed import TextEmbedding

# _MODEL_NAME = "BAAI/bge-small-en-v1.5"  # 384-dim, strong small retrieval model
_MODEL_NAME = "BAAI/bge-base-en-v1.5"  # 384-dim, strong small retrieval model
_model = None


def _get_model() -> TextEmbedding:
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=_MODEL_NAME)
    return _model


def embed_texts(texts: List[str]) -> np.ndarray:
    """Embed a list of passages. Returns an (N, D) float32 numpy array."""
    if not texts:
        return np.zeros((0, 384), dtype=np.float32)
    model = _get_model()
    # bge models recommend no special prefix for passages, "query: " prefix for queries
    vectors = list(model.embed(texts))
    return np.array(vectors, dtype=np.float32)


def embed_query(query: str) -> np.ndarray:
    """Embed a single search query."""
    model = _get_model()
    prefixed = f"query: {query}"
    vector = list(model.embed([prefixed]))[0]
    return np.array(vector, dtype=np.float32)
