"""
groq_client.py
Thin wrapper around Groq's OpenAI-compatible chat completions endpoint.
The API key is supplied per-request by the caller (visitor's own key) —
nothing is stored server-side.
"""
import requests
from typing import List, Dict, Optional

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

# Fast + strong general model on Groq. Swap freely (e.g. "llama-3.1-8b-instant"
# for lower latency/cost, or "llama-3.3-70b-versatile" for higher quality).
DEFAULT_MODEL = "openai/gpt-oss-120b"


class GroqError(Exception):
    pass


def chat_completion(
    api_key: str,
    messages: List[Dict[str, str]],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.2,
    max_tokens: int = 1024,
    response_format_json: bool = False,
) -> str:
    if not api_key or not api_key.strip():
        raise GroqError("Missing Groq API key.")

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format_json:
        payload["response_format"] = {"type": "json_object"}

    try:
        resp = requests.post(
            GROQ_CHAT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
    except requests.RequestException as exc:
        raise GroqError(f"Could not reach Groq API: {exc}") from exc

    if resp.status_code == 401:
        raise GroqError("Invalid Groq API key. Please check the key and try again.")
    if resp.status_code == 429:
        raise GroqError("Groq rate limit hit. Please wait a moment and try again.")
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("error", {}).get("message", resp.text)
        except Exception:
            detail = resp.text
        raise GroqError(f"Groq API error ({resp.status_code}): {detail}")

    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise GroqError(f"Unexpected Groq response shape: {data}") from exc
