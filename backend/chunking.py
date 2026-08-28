"""
chunking.py
Splits long document text into overlapping, retrieval-sized chunks.
Simple word-window splitter with sentence-aware trimming — no heavy deps.
"""
import re
from typing import List

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def chunk_text(
    text: str,
    chunk_size: int = 350
):
    text = re.sub(r"\n{3,}", "\n\n", text.strip())

    paragraphs = [
        p.strip()
        for p in re.split(r"\n\s*\n", text)
        if p.strip()
    ]

    chunks = []
    current = ""

    for para in paragraphs:

        candidate = (
            current + "\n\n" + para
            if current
            else para
        )

        if len(candidate.split()) <= chunk_size:
            current = candidate

        else:
            if current:
                chunks.append(current)

            current = para

    if current:
        chunks.append(current)

    return chunks
