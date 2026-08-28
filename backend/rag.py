"""
rag.py
Retrieval-Augmented Generation: embed the user's question, pull the most
relevant chunks from the vector store, and ask Groq to answer using only
that retrieved context (with inline source citations).
"""
from typing import Optional, List, Dict
import re
from embeddings import embed_query
from vectorstore import store
from groq_client import chat_completion






RAG_SYSTEM_PROMPT = """
You are a Retrieval-Augmented Generation (RAG) assistant.

Use ONLY the provided source excerpts.

Instructions:
1. Answer directly and specifically.
2. Do NOT write a document summary unless the user explicitly asks for one.
3. If the user asks a factual question, return only the relevant facts.
4. If information is missing, say:
   "The provided documents do not contain that information."
5. Prefer bullet points over long paragraphs.
6. Never combine unrelated excerpts into a narrative unless asked to summarize.
7. DO NOT include citations such as [1], [2], 【1†L1-L5】, (Source 1), or any reference markers in the response.
8. Do NOT use markdown formatting.
9. Do NOT use **bold**, *italic*, # headings or code blocks.
10. Use plain text only.
11. If the user is asking about the document itself, prefer the document's stored type and summary when available.
12. If the user asks for precision or a direct answer, be short and specific.
"""


DOCUMENT_OVERVIEW_PATTERNS = (
    "what type of document",
    "what kind of document",
    "what is this document about",
    "what this document is about",
    "tell me about this document",
    "summarize this document",
    "give me a summary of this document",
    "document summary",
    "document type",
    "identify this document",
)

PRECISION_FOLLOWUP_PATTERNS = (
    "be precise",
    "more precise",
    "precise version",
    "make it precise",
    "more specific",
    "shorter",
    "short version",
    "just the answer",
    "answer precisely",
    "be specific",
    "in one line",
    "one line",
)


def _is_document_overview_question(question_lower: str) -> bool:
    return any(pattern in question_lower for pattern in DOCUMENT_OVERVIEW_PATTERNS)


def _is_precision_followup(question_lower: str) -> bool:
    return any(pattern in question_lower for pattern in PRECISION_FOLLOWUP_PATTERNS)


def _last_message(chat_history: Optional[List[Dict[str, str]]], role: str) -> str:
    for turn in reversed(chat_history or []):
        if turn.get("role") == role and turn.get("content"):
            return str(turn["content"]).strip()
    return ""


def _resolve_target_document(doc_id: Optional[str]):
    if doc_id and doc_id != "all":
        return store.get_document(doc_id)

    docs = store.list_documents()
    if len(docs) == 1:
        return docs[0]

    return None


def _format_document_answer(question_lower: str, doc) -> str:
    doc_type = (doc.doc_type or "Unclassified").strip()
    summary = (doc.summary or "").strip()
    entities = [e for e in (doc.key_entities or []) if str(e).strip()]

    if "type" in question_lower or "kind" in question_lower or "identify" in question_lower:
        return f"This is a {doc_type}."

    if "summary" in question_lower or "overview" in question_lower or "about" in question_lower:
        if summary:
            return summary
        if doc_type and doc_type != "Unclassified":
            return f"This document is classified as {doc_type}, but no summary was extracted."

    if entities:
        return (
            f"This is a {doc_type}.\n"
            f"Summary: {summary or 'No summary was extracted.'}\n"
            f"Key entities: {', '.join(entities[:8])}."
        )

    return f"This is a {doc_type}. {summary}".strip()


def _build_effective_question(question: str, chat_history: Optional[List[Dict[str, str]]]) -> str:
    question_lower = question.lower()
    if not _is_precision_followup(question_lower):
        return question

    previous_user = _last_message(chat_history, "user")
    previous_assistant = _last_message(chat_history, "assistant")

    if previous_user and previous_user.lower() != question_lower:
        return f"{previous_user} Be precise and concise."

    if previous_assistant:
        return f"Refine the previous answer to be more precise and concise: {previous_assistant}"

    return question










def answer_question(
    question: str,
    api_key: str,
    doc_id: Optional[str] = None,
    top_k: int = 5,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> dict:
    """
    Runs the full RAG pipeline and returns the answer plus the sources
    used, so the UI can render citations.
    """
    question_lower = question.lower()
    target_doc = _resolve_target_document(doc_id)
    effective_question = _build_effective_question(question, chat_history)
    effective_question_lower = effective_question.lower()

    if target_doc and (_is_document_overview_question(question_lower) or _is_document_overview_question(effective_question_lower)):
        return {
            "answer": _format_document_answer(effective_question_lower, target_doc),
            "sources": [],
        }

    if any(
        word in effective_question_lower
        for word in [
            "summary",
            "summarize",
            "overview",
            "what is this document about"
        ]
    ):
        top_k = 8

    elif len(effective_question.split()) < 6:
        top_k = 2

    else:
        top_k = 4


    query_vector = embed_query(effective_question)
    results = store.search(query_vector, doc_id=doc_id, top_k=top_k)
    question_words = set(
        effective_question.lower().split()
    )

    reranked = []

    for score, chunk in results:

        overlap = len(
            question_words &
            set(chunk.text.lower().split())
        )

        final_score = score + overlap * 0.05

        reranked.append((final_score, score, chunk))

    reranked.sort(
        key=lambda x: x[0],
        reverse=True
    )

    results = [
        (final_score, orig_score, chunk)
        for final_score, orig_score, chunk in reranked
    ]

    if not results:
        if target_doc and target_doc.summary:
            return {
                "answer": _format_document_answer(question_lower, target_doc),
                "sources": [],
            }

        return {
            "answer": "I couldn't find enough relevant information in the uploaded documents to answer confidently.",
            "sources": [],
        }

    best_score = results[0][0]

    if best_score < 0.42:
        return {
            "answer": "I couldn't find enough relevant information in the uploaded documents to answer confidently.",
            "sources": [],
        }

    context_blocks = []
    sources = []
    for i, (score, orig_score, chunk) in enumerate(results, start=1):
        doc = store.get_document(chunk.doc_id)
        doc_name = doc.filename if doc else chunk.doc_id
        context_blocks.append(
            f"""
        SOURCE [{i}]
        Document: {doc_name}
        Chunk: {chunk.position}

        Content:
        {chunk.text}
        """
        )
        sources.append({
            "index": i,
            "doc_id": chunk.doc_id,
            "filename": doc_name,
            "snippet": chunk.text[:280] + ("..." if len(chunk.text) > 280 else ""),
            "relevance": round(score, 3),
        })

    context = "\n\n".join(context_blocks)

    messages = [{"role": "system", "content": RAG_SYSTEM_PROMPT}]

    # keep a little conversational memory (last few turns) for follow-ups
    for turn in (chat_history or [])[-6:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})

    messages.append({
        "role": "user",
        "content": f"SOURCE EXCERPTS:\n\n{context}\n\nQUESTION: {effective_question}",
    })

    answer = chat_completion(
        api_key=api_key,
        messages=messages,
        temperature=0.2,
        max_tokens=800,
    )

    # remove markdown bold
    answer = re.sub(r"\*\*(.*?)\*\*", r"\1", answer)

    # remove markdown italic
    answer = re.sub(r"\*(.*?)\*", r"\1", answer)

    # remove weird citation formats
    answer = re.sub(r"【.*?】", "", answer)

    # remove [1], [2], [3] references
    answer = re.sub(r"\[\d+\]", "", answer)

    # collapse excessive blank lines
    answer = re.sub(r"\n{3,}", "\n\n", answer)

    answer = answer.strip()



    return {"answer": answer, "sources": sources}
