"""
Lightweight serverless-safe embeddings.

This implementation intentionally avoids FastEmbed / ONNX model downloads.
It creates deterministic hashed token vectors using NumPy only, making it
suitable for Vercel Functions.

For a production semantic-search system, replace this with a hosted
embedding API or persistent vector database.
"""

import hashlib
import re
from typing import List

import numpy as np


EMBEDDING_DIM = 384


def _tokenize(text: str) -> List[str]:
    """
    Basic tokenizer with unigrams + bigrams.
    """
    words = re.findall(
        r"[a-zA-Z0-9]+",
        (text or "").lower()
    )

    tokens = list(words)

    # Add bigrams to improve phrase matching.
    tokens.extend(
        f"{words[i]}_{words[i + 1]}"
        for i in range(len(words) - 1)
    )

    return tokens


def _hash_token(token: str) -> tuple[int, float]:
    """
    Convert a token into a stable vector position and sign.
    Python's built-in hash() is intentionally not used because it changes
    between interpreter processes.
    """
    digest = hashlib.sha256(
        token.encode("utf-8")
    ).digest()

    index = int.from_bytes(
        digest[:4],
        "little"
    ) % EMBEDDING_DIM

    sign = (
        1.0
        if digest[4] % 2 == 0
        else -1.0
    )

    return index, sign


def _embed(text: str) -> np.ndarray:
    vector = np.zeros(
        EMBEDDING_DIM,
        dtype=np.float32
    )

    tokens = _tokenize(text)

    if not tokens:
        return vector

    for token in tokens:
        index, sign = _hash_token(token)

        vector[index] += sign

    # L2 normalize.
    norm = np.linalg.norm(vector)

    if norm > 0:
        vector /= norm

    return vector


def embed_texts(texts: List[str]) -> np.ndarray:
    """
    Embed document chunks.

    Returns:
        numpy array with shape (N, 384)
    """
    if not texts:
        return np.zeros(
            (0, EMBEDDING_DIM),
            dtype=np.float32
        )

    return np.vstack(
        [_embed(text) for text in texts]
    ).astype(np.float32)


def embed_query(query: str) -> np.ndarray:
    """
    Embed a user query using the same representation as document chunks.
    """
    return _embed(query)
