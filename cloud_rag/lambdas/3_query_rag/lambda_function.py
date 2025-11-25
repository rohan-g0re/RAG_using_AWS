import json
import os
import boto3

"""
QueryRagLambda

Responsibilities:
1. Receive a natural-language question + user/paper context.
2. Embed the question using the SAME Titan embeddings model as indexing.
3. Query S3 Vectors (paper-vectors bucket, paper-chunks index) for top-K similar chunks.
4. Return those chunks, and optionally:
   - Invoke GeminiLambda with {question, chunks} to get a final answer.

Expected event shape:

{
  "user_id": "dev-user",
  "paper_ids": ["History_of_ML"],          # optional
  "question": "What is machine learning?",
  "top_k": 5,                              # optional, overrides default
  "invoke_gemini": true                    # optional (default: true if GEMINI_LAMBDA_ARN set)
}

Response shape:

{
  "question": "...",
  "top_k_chunks": [
    {
      "rank": 1,
      "similarity": 0.8,
      "text": "...",
      "user_id": "dev-user",
      "paper_id": "History_of_ML",
      "chunk_index": 0
    },
    ...
  ],
  "answer": "...."                         # present only if GeminiLambda invoked
}
"""

# ---- AWS clients ----
bedrock = boto3.client("bedrock-runtime")
s3v = boto3.client("s3vectors")
lambda_client = boto3.client("lambda")

# ---- Environment variables ----
VECTOR_BUCKET = os.environ["VECTOR_BUCKET"]          # e.g. "paper-vectors-rohan-dev"
VECTOR_INDEX = os.environ["VECTOR_INDEX"]            # e.g. "paper-chunks"
BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "amazon.titan-embed-text-v2:0"
)
DEFAULT_TOP_K = int(os.environ.get("DEFAULT_TOP_K", "2"))

GEMINI_LAMBDA_ARN = os.environ.get("GEMINI_LAMBDA_ARN")  # optional


def embed_text(text: str, dims: int = 256) -> list[float]:
    """
    Call Amazon Titan Text Embeddings V2 via Bedrock and return the vector.
    Must match the embedding model+dims used in ChunkAndEmbedLambda.
    """
    body = {
        "inputText": text,
        "dimensions": dims,
        "normalize": True,
    }

    response = bedrock.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )

    payload = json.loads(response["body"].read())

    embedding = (
        payload.get("embedding")
        or payload.get("embeddings")
        or payload.get("vector")
    )

    if embedding is None:
        raise RuntimeError(f"Unexpected embedding response format: {payload}")

    return embedding


def _build_filter(user_id: str | None, paper_ids: list[str] | None) -> dict | None:
    """
    Build a S3 Vectors metadata filter using Mongo-like syntax:
      - {"user_id": {"$eq": user_id}}
      - {"$and": [ {"user_id": {"$eq": user}}, {"paper_id": {"$in": paper_ids}} ]}
    Return None if no filter is needed.
    """
    if not user_id and not paper_ids:
        return None

    if user_id and not paper_ids:
        return {"user_id": {"$eq": user_id}}

    if user_id and paper_ids:
        return {
            "$and": [
                {"user_id": {"$eq": user_id}},
                {"paper_id": {"$in": paper_ids}},
            ]
        }

    # Only paper_ids without user_id (unlikely, but allowed)
    return {"paper_id": {"$in": paper_ids}}


def lambda_handler(event, context):
    """
    Main entrypoint for QueryRagLambda.
    """
    print("[QueryRagLambda] Event:", json.dumps(event))

    question = event["question"]
    user_id = event.get("user_id")
    paper_ids = event.get("paper_ids")
    top_k = int(event.get("top_k", DEFAULT_TOP_K))
    invoke_gemini = bool(event.get("invoke_gemini", True))

    # ---- 1. Embed the question ----
    q_embedding = embed_text(question)

    # ---- 2. Build filter (optional) ----
    filter_obj = _build_filter(user_id, paper_ids)

    # ---- 3. Query S3 Vectors ----
    query_kwargs = {
        "vectorBucketName": VECTOR_BUCKET,
        "indexName": VECTOR_INDEX,
        "queryVector": {"float32": q_embedding},
        "topK": top_k,
        "returnMetadata": True,
        "returnDistance": True,
    }

    # Only include filter if we actually built one (None will cause ValidationException)
    if filter_obj is not None:
        query_kwargs["filter"] = filter_obj

    print(f"[QueryRagLambda] Querying S3 Vectors with topK={top_k}, filter={filter_obj}")
    resp = s3v.query_vectors(**query_kwargs)

    hits = resp.get("vectors", [])
    print(f"[QueryRagLambda] Received {len(hits)} hits from S3 Vectors.")

    # ---- 4. Convert hits into chunk objects ----
    top_k_chunks: list[dict] = []
    for rank, v in enumerate(hits, start=1):
        md = v.get("metadata", {}) or {}
        dist = v.get("distance", 0.0)
        similarity = 1.0 - float(dist)

        chunk = {
            "rank": rank,
            "similarity": similarity,
            "text": md.get("source_text", ""),
            "user_id": md.get("user_id"),
            "paper_id": md.get("paper_id"),
            "chunk_index": md.get("chunk_index"),
        }
        top_k_chunks.append(chunk)

    # If we don't want Gemini or ARN not set, just return chunks
    if not GEMINI_LAMBDA_ARN or not invoke_gemini:
        print("[QueryRagLambda] GEMINI_LAMBDA_ARN not set or invoke_gemini=False; returning chunks only.")
        return {
            "question": question,
            "top_k_chunks": top_k_chunks,
            "answer": None,
        }

    # ---- 5. Invoke GeminiLambda for final answer ----
    gemini_payload = {
        "question": question,
        "chunks": top_k_chunks,
    }

    print(f"[QueryRagLambda] Invoking GeminiLambda: {GEMINI_LAMBDA_ARN}")
    gem_resp = lambda_client.invoke(
        FunctionName=GEMINI_LAMBDA_ARN,
        InvocationType="RequestResponse",
        Payload=json.dumps(gemini_payload),
    )

    gem_body_raw = gem_resp["Payload"].read().decode("utf-8") or "{}"
    print(f"[QueryRagLambda] GeminiLambda raw response: {gem_body_raw}")
    gem_result = json.loads(gem_body_raw)

    answer = gem_result.get("answer")

    return {
        "question": question,
        "top_k_chunks": top_k_chunks,
        "answer": answer,
    }