"""
classifier.py
Uses a Groq LLM as a zero-shot document classifier + structured extractor.
Given the first chunk of a document, it returns a document type, short
summary and key entities as JSON.
"""
import json
from groq_client import chat_completion, GroqError

CLASSIFY_SYSTEM_PROMPT = """You are a document intelligence system. Given raw \
text extracted from a document, classify it and extract key structured \
information. Respond ONLY with a JSON object, no prose, no markdown fences.

JSON shape:
{
  "document_type": string,   // e.g. "Invoice", "Contract", "Resume/CV",
                              // "Research Paper", "Legal Filing", "Report",
                              // "Email", "Financial Statement", "Letter",
                              // "Meeting Notes", "Policy Document", "Other"
  "summary": string,         // 2-3 sentence plain-language summary
  "key_entities": string[],  // up to 8 short items: names, dates, amounts,
                              // organizations, reference numbers, etc.
  "confidence": number       // 0.0-1.0, how confident you are in document_type
}"""


def classify_document(text_sample: str, api_key: str) -> dict:
    """Classify + extract structured metadata from a text sample."""
    sample = text_sample[:6000]  # keep prompt small/cheap

    try:
        raw = chat_completion(
            api_key=api_key,
            messages=[
                {"role": "system", "content": CLASSIFY_SYSTEM_PROMPT},
                {"role": "user", "content": sample},
            ],
            temperature=0.1,
            max_tokens=500,
            response_format_json=True,
        )
        parsed = json.loads(raw)
        return {
            "document_type": str(parsed.get("document_type", "Unknown"))[:60],
            "summary": str(parsed.get("summary", ""))[:600],
            "key_entities": [str(e)[:80] for e in parsed.get("key_entities", [])][:8],
            "confidence": float(parsed.get("confidence", 0.5)),
        }
    except GroqError:
        raise
    except (json.JSONDecodeError, ValueError, TypeError):
        # Model returned non-JSON — fail soft with a generic classification
        return {
            "document_type": "Unclassified",
            "summary": "Automatic classification failed to parse; document was still indexed for search.",
            "key_entities": [],
            "confidence": 0.0,
        }
