Yes, we’re ready — and since we can’t “wait and plan later”, let’s actually start wiring this up now.

I’ll treat this as: **we’re committing to Python Lambdas + S3 Vectors + Bedrock embeddings + Gemini.**

I’ll do 3 things in this message:

1. Lock in the **final architecture** (very short).
2. Define the **data shapes** (keys, metadata, etc.).
3. Give you **implementation-ready Lambda skeletons** you can expand.

---

# 1. Final architecture (locked)

Services we’re using:

* **S3 (normal bucket)** – raw PDFs (`paper-pdfs`)
* **S3 Vectors (vector bucket)** – embeddings + metadata (`paper-vectors`, index: `paper-chunks`)
* **Lambda 1: IndexPdfLambda** – PDF → plain text
* **Lambda 2: ChunkAndEmbedLambda** – text → chunks → Titan embeddings → S3 Vectors (with raw text in non-filterable metadata)
* **Lambda 3: QueryRagLambda** – question → Titan embedding → S3 Vectors top-K → pass `{question, chunks}` to next Lambda
* **Lambda 4: GeminiLambda** – build prompt → Gemini → return/log answer
* (Plus: IAM roles, Bedrock access, S3 Vectors access, Gemini API key in Secrets Manager or env var)

Event flow:

1. **PDF uploaded** to `paper-pdfs` → S3 event → `IndexPdfLambda`.
2. `IndexPdfLambda` writes extracted text file to an S3 key (e.g., `paper-texts/user123/paper456.txt`) and triggers `ChunkAndEmbedLambda` (e.g., via direct invoke or SQS).
3. `ChunkAndEmbedLambda`:

   * Ensures vector bucket/index exist (once per cold start).
   * Chunks text, calls Titan embeddings, stores vectors in S3 Vectors (with `source_text` metadata).
4. Frontend calls API → `QueryRagLambda` with `"question"` and maybe `"paper_ids"`.
5. `QueryRagLambda`:

   * Embeds question with Titan.
   * Calls `QueryVectors` on S3 Vectors.
   * Extracts `source_text` from metadata for top-K hits.
   * Invokes `GeminiLambda` with `{question, chunks}`.
6. `GeminiLambda`:

   * Calls Gemini with a structured prompt.
   * Logs and returns answer.

---

# 2. Data shapes we’ll use

### 2.1 S3 keys

* **PDF bucket**: `paper-pdfs`

  * Key: `user/{user_id}/papers/{paper_id}.pdf`

* **Text bucket** (optional, if you want to save extracted text): `paper-texts`

  * Key: `user/{user_id}/papers/{paper_id}.txt`

(For Option A we technically don’t *need* this long-term because raw text is inside vector metadata, but I’d still keep it in case you ever reindex.)

### 2.2 S3 Vectors

* **Vector bucket name**: `paper-vectors`
* **Index name**: `paper-chunks`

Per vector:

* **key**: `user/{user_id}/papers/{paper_id}/chunks/{chunk_id}`
* **vector values**: Titan embedding (`float32` list)
* **metadata**:

  * Filterable:

    * `user_id`: `"user123"`
    * `paper_id`: `"paper456"`
  * Non-filterable:

    * `source_text`: `"actual chunk text here..."`

So one vector record looks like (conceptually):

```json
{
  "key": "user/user123/papers/paper456/chunks/chunk-0001",
  "values": { "float32": [0.01, -0.2, ...] },
  "metadata": {
    "user_id": "user123",
    "paper_id": "paper456",
    "source_text": "This chunk explains the method section where..."
  }
}
```

You’ll configure `user_id` / `paper_id` as **filterable** keys and `source_text` as a **non-filterable metadata key** when creating the index.

---

# 3. Lambda skeletons (Python)

These are not copy-paste perfect (you’ll wire IAM/regions/etc.), but they’re **structurally ready**.

---

## 3.1 Lambda 1 – `IndexPdfLambda` (PDF → text)

Triggered by S3 `ObjectCreated` on `paper-pdfs`.

```python
import json
import boto3
import os
from io import BytesIO
from pypdf import PdfReader  # add to Lambda layer / deployment package

s3 = boto3.client("s3")
LAMBDA_INVOKE_ARN = os.environ.get("CHUNK_EMBED_LAMBDA_ARN")

lambda_client = boto3.client("lambda")

def extract_text_from_pdf(stream: BytesIO) -> str:
    reader = PdfReader(stream)
    texts = []
    for page in reader.pages:
        t = page.extract_text() or ""
        texts.append(t)
    return "\n".join(texts)

def handler(event, context):
    # event from S3
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    # parse user_id and paper_id from key if you encode them in path
    # e.g. key = "user/<user_id>/papers/<paper_id>.pdf"
    parts = key.split("/")
    user_id = parts[1]
    paper_id = parts[3].split(".")[0]

    # download pdf
    obj = s3.get_object(Bucket=bucket, Key=key)
    pdf_bytes = obj["Body"].read()

    text = extract_text_from_pdf(BytesIO(pdf_bytes))

    # (optional) store text to S3 for debugging or reindexing
    text_bucket = os.environ.get("TEXT_BUCKET", "paper-texts")
    text_key = f"user/{user_id}/papers/{paper_id}.txt"
    s3.put_object(
        Bucket=text_bucket,
        Key=text_key,
        Body=text.encode("utf-8"),
    )

    # now trigger ChunkAndEmbedLambda with minimal payload
    payload = {
        "user_id": user_id,
        "paper_id": paper_id,
        "text_s3_bucket": text_bucket,
        "text_s3_key": text_key,
    }

    lambda_client.invoke(
        FunctionName=LAMBDA_INVOKE_ARN,
        InvocationType="Event",  # async
        Payload=json.dumps(payload),
    )

    return {"statusCode": 200}
```

---

## 3.2 Lambda 2 – `ChunkAndEmbedLambda` (text → chunks → Titan → S3 Vectors)

Called from Lambda 1 (or SQS later).

```python
import json
import os
import boto3

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("BEDROCK_REGION", "us-east-1"))
s3v = boto3.client("s3vectors")  # actual client name may be 's3control' / 's3' with special endpoint; adjust per docs

VECTOR_BUCKET = os.environ.get("VECTOR_BUCKET", "paper-vectors")
INDEX_NAME = os.environ.get("VECTOR_INDEX", "paper-chunks")

def ensure_vector_index():
    """
    Pseudo-code: create vector bucket & index if they don't exist.
    Do this once per cold start; keep it idempotent.
    """
    # TODO: use real S3 Vectors API to describe/create bucket and index.
    # Pseudocode:
    # try: s3v.describe_vector_bucket(...)
    # except NotFound: s3v.create_vector_bucket(...)
    # try: s3v.describe_index(...)
    # except NotFound:
    #   s3v.create_index(
    #       vectorBucketName=VECTOR_BUCKET,
    #       indexName=INDEX_NAME,
    #       ...,
    #       filterableMetadataKeys=["user_id", "paper_id"],
    #       nonFilterableMetadataKeys=["source_text"],
    #   )
    pass

def chunk_text(text: str, max_chars: int = 2000):
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        chunk = text[start:end]
        chunks.append(chunk)
        start = end
    return chunks

def embed_text(text: str, dims: int = 256) -> list[float]:
    body = {
        "inputText": text,
        "dimensions": dims,
        "normalize": True,
    }
    response = bedrock.invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )
    out = json.loads(response["body"].read())
    return out["embedding"]

def handler(event, context):
    ensure_vector_index()

    user_id = event["user_id"]
    paper_id = event["paper_id"]
    text_bucket = event["text_s3_bucket"]
    text_key = event["text_s3_key"]

    obj = s3.get_object(Bucket=text_bucket, Key=text_key)
    full_text = obj["Body"].read().decode("utf-8")

    chunks = chunk_text(full_text, max_chars=2000)

    vectors_payload = []

    for idx, chunk in enumerate(chunks):
        if not chunk.strip():
            continue

        embedding = embed_text(chunk)

        chunk_id = f"chunk-{idx:04d}"
        key = f"user/{user_id}/papers/{paper_id}/chunks/{chunk_id}"

        vectors_payload.append(
            {
                "key": key,
                "values": {"float32": embedding},
                "metadata": {
                    # "user_id" and "paper_id" are filterable
                    "user_id": user_id,
                    "paper_id": paper_id,
                    # "source_text" is non-filterable, but we want it returned
                    "source_text": chunk,
                },
            }
        )

        # Optionally batch every N vectors
        if len(vectors_payload) >= 50:
            s3v.put_vectors(
                vectorBucketName=VECTOR_BUCKET,
                indexName=INDEX_NAME,
                vectors=vectors_payload,
            )
            vectors_payload = []

    # Flush remaining
    if vectors_payload:
        s3v.put_vectors(
            vectorBucketName=VECTOR_BUCKET,
            indexName=INDEX_NAME,
            vectors=vectors_payload,
        )

    return {"statusCode": 200, "chunks_indexed": len(chunks)}
```

> **Note:** The `s3vectors` client name and exact `put_vectors` params will depend on the final AWS SDK; you’ll adapt to the actual `boto3` API from the docs, but structurally this is what you’ll implement.

---

## 3.3 Lambda 3 – `QueryRagLambda` (question → Titan → S3 Vectors → top-K → call GeminiLambda)

```python
import json
import os
import boto3

bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("BEDROCK_REGION", "us-east-1"))
s3v = boto3.client("s3vectors")
lambda_client = boto3.client("lambda")

VECTOR_BUCKET = os.environ.get("VECTOR_BUCKET", "paper-vectors")
INDEX_NAME = os.environ.get("VECTOR_INDEX", "paper-chunks")
GEMINI_LAMBDA_ARN = os.environ.get("GEMINI_LAMBDA_ARN")

def embed_text(text: str, dims: int = 256) -> list[float]:
    body = {
        "inputText": text,
        "dimensions": dims,
        "normalize": True,
    }
    response = bedrock.invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )
    out = json.loads(response["body"].read())
    return out["embedding"]

def handler(event, context):
    """
    event: { "question": "...", "user_id": "...", "paper_ids": ["paper456", ...], "top_k": 10 }
    """
    question = event["question"]
    user_id = event.get("user_id")
    paper_ids = event.get("paper_ids")  # optional
    top_k = event.get("top_k", 10)

    q_embedding = embed_text(question)

    # Build filter: user_id + optional paper_ids
    filter_obj = {
        "user_id": {"equals": user_id}
    }
    if paper_ids:
        filter_obj["paper_id"] = {"in": paper_ids}

    resp = s3v.query_vectors(
        vectorBucketName=VECTOR_BUCKET,
        indexName=INDEX_NAME,
        queryVector={"float32": q_embedding},
        topK=top_k,
        filter=filter_obj,
        returnMetadata=True,
        returnDistance=True,
    )

    hits = resp.get("vectors", [])
    chunk_texts = []
    for v in hits:
        md = v.get("metadata", {})
        chunk_text = md.get("source_text", "")
        if chunk_text:
            chunk_texts.append(chunk_text)

    # Now call GeminiLambda
    payload = {
        "question": question,
        "chunks": chunk_texts,
        "user_id": user_id,
    }

    gem_resp = lambda_client.invoke(
        FunctionName=GEMINI_LAMBDA_ARN,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload),
    )

    body = gem_resp["Payload"].read().decode("utf-8")
    result = json.loads(body)

    # Pass-through answer
    return {
        "statusCode": 200,
        "answer": result.get("answer"),
        "raw": result,
    }
```

---

## 3.4 Lambda 4 – `GeminiLambda` (RAG answer)

You’ll use the Gemini REST API; the exact client depends on whether you use Vertex AI official SDK or plain HTTP. Skeleton:

```python
import json
import os
import requests  # or google-generativeai, depending on how you set it up

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")

def build_prompt(question: str, chunks: list[str]) -> str:
    context_blocks = []
    for i, c in enumerate(chunks):
        context_blocks.append(f"[CHUNK {i+1}]\n{c}")
    context_str = "\n\n".join(context_blocks)

    prompt = f"""
You are a helpful research assistant. Use ONLY the following paper excerpts to
answer the user's question. If the answer cannot be found in the excerpts, say
you don't know and do not hallucinate.

Context:
{context_str}

User question:
{question}
"""
    return prompt.strip()

def call_gemini(prompt: str) -> str:
    # This is conceptual; adjust for Vertex / PaLM v1 / new endpoints
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }
    data = {
        "contents": [
            {"parts": [{"text": prompt}]}
        ]
    }
    resp = requests.post(url, headers=headers, json=data, timeout=30)
    resp.raise_for_status()
    out = resp.json()
    # Parse according to Gemini response schema
    candidates = out.get("candidates", [])
    if not candidates:
        return "No answer from model."
    text = candidates[0]["content"]["parts"][0]["text"]
    return text

def handler(event, context):
    question = event["question"]
    chunks = event["chunks"]

    prompt = build_prompt(question, chunks)
    answer = call_gemini(prompt)

    # Here you can also log to DynamoDB, CloudWatch, etc.
    return {
        "statusCode": 200,
        "answer": answer,
    }
```
