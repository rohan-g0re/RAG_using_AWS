import json
import os
import boto3
import urllib.request
import urllib.error

secrets_client = boto3.client("secretsmanager")

GEMINI_SECRET_NAME = os.environ.get("GEMINI_SECRET_NAME", "gemini/api-key/dev")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


def get_gemini_api_key() -> str:
    """Load Gemini API key from Secrets Manager."""
    resp = secrets_client.get_secret_value(SecretId=GEMINI_SECRET_NAME)
    secret_str = resp["SecretString"]

    try:
        data = json.loads(secret_str)
        api_key = data.get("GEMINI_API_KEY") or secret_str
    except json.JSONDecodeError:
        api_key = secret_str

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not found in secret")

    return api_key


def build_prompt(question: str, chunks: list[dict]) -> str:
    context_blocks = []
    for c in chunks:
        rank = c.get("rank")
        text = c.get("text", "")
        context_blocks.append(f"[CHUNK {rank}]\n{text}")

    context_text = "\n\n".join(context_blocks) if context_blocks else "(no context provided)"

    prompt = f"""
You are a helpful research assistant. Use ONLY the provided context excerpts
from research papers to answer the question. If the answer is not clearly
supported by the context, say "I don't know based on the provided papers."

Question:
{question}

Context:
{context_text}

Answer in a clear, concise paragraph, and avoid guessing if the context is insufficient.
""".strip()

    return prompt


def call_gemini(prompt: str) -> str:
    api_key = get_gemini_api_key()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"

    body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }

    data = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        print("[GeminiLambda] HTTPError:", e.code, err_body)
        raise
    except Exception as e:
        print("[GeminiLambda] Request error:", repr(e))
        raise

    resp_json = json.loads(resp_body)

    # Parse text from Gemini response
    try:
        candidates = resp_json.get("candidates", [])
        if not candidates:
            return "Model returned no candidates."

        first = candidates[0]
        parts = first.get("content", {}).get("parts", [])
        if not parts:
            return "Model returned no content parts."

        return parts[0].get("text", "Model returned no text.")
    except Exception as e:
        print("[GeminiLambda] Parse error:", repr(e), "raw:", resp_json)
        return "Failed to parse model response."


def lambda_handler(event, context):
    print("[GeminiLambda] Event:", json.dumps(event))

    question = event["question"]
    chunks = event.get("chunks") or event.get("top_k_chunks") or []

    prompt = build_prompt(question, chunks)
    print("[GeminiLambda] Prompt length:", len(prompt))

    answer = call_gemini(prompt)

    return {
        "answer": answer,
        "used_chunks": len(chunks),
    }