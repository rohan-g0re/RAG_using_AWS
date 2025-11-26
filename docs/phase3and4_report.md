# Phase 3 & Phase 4 Completion Report – Cloud RAG System

# **1. Overview of Phase 3 & Phase 4 Goals**

### **Phase 3 – QueryRagLambda (Retriever Pipeline)**

Goal: Given only a natural-language question, retrieve the most relevant chunks from S3 Vectors.

### **Phase 4 – GeminiLambda (Generator Pipeline)**

Goal: Given ( K ) retrieved chunks + the user question → call Gemini LLM → produce a grounded answer.

These two phases complete the **Retriever + Generator** components of the RAG architecture.

---

# **2. Phase 3 – QueryRagLambda**

## **2.1 Responsibilities Implemented**

QueryRagLambda performs the following steps end-to-end:

### **1. Parse input event:**

Supports input JSON of the form:

**IMPORTANT** --> The paper_ids should be added by the backend itself, if that is difficult to implement then we would need to change the request structure for both the lambdas. 

```json
{
  "user_id": "dev-user",
  "paper_ids": ["PaperA", "PaperB"],
  "question": "...",
  "top_k": 5,
  "invoke_gemini": true
}
```

### **2. Embed the user question using Titan Embeddings v2**

Uses the same embedding model as the indexing pipeline:

* `amazon.titan-embed-text-v2:0`
* 256-dim embeddings
* Normalized vectors for cosine similarity


### **3. Query S3 Vectors index**

Using:

```python
s3v.query_vectors(
  vectorBucketName=VECTOR_BUCKET,
  indexName=VECTOR_INDEX,
  queryVector={"float32": embedding},
  filter=filter,
  returnMetadata=True,
  topK=top_k,
)
```

### **4. Extract top-K chunks**

Metadata returned by S3 Vectors includes:

* `source_text`
* `user_id`
* `paper_id`
* `chunk_index`

Chunks are formatted into consistent objects like:

```json
{
  "rank": 1,
  "similarity": 0.71,
  "text": "...",
  "user_id": "dev-user",
  "paper_id": "Cloud_Computing_Paper_Review",
  "chunk_index": 3
}
```

### **5. Invokes GeminiLambda**

If `invoke_gemini=true`, the Lambda:

* Sends `{ question, chunks }`
* Uses `lambda:InvokeFunction` on GeminiLambda

Example payload sent:

```json
{
  "question": "What is BigQuery?",
  "chunks": [ {"rank":1, ...}, {"rank":2, ...} ]
}
```

### **6. Combine final answer**

QueryRagLambda returns:

```json
{
  "question": "...",
  "top_k_chunks": [...],
  "answer": "final grounded answer"
}
```

---


# **4. Phase 4 – GeminiLambda**

## **4.1 Responsibilities Implemented**

GeminiLambda performs:

1. Receive payload:

```json
{
  "question": "...",
  "chunks": [...]
}
```

2. Build RAG prompt:

* Includes question
* Includes labeled context blocks
* Includes strict grounding instructions

3. Call Gemini via REST API (NO google‑generativeai SDK)

* Uses `urllib.request`
* Avoids grpc/cygrpc incompatibility
* Sends prompt via:

```
https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<api_key>
```

4. Extract final answer text from Gemini response.
5. Return JSON:

```json
{
  "answer": "...",
  "used_chunks": 5
}
```

## **4.2 Prompt Structure**

Prompt uses this structure:

```
You are a helpful research assistant...

Question:
<question>

Context:
[CHUNK 1]
<text>

[CHUNK 2]
<text>
```

## **4.3 Error Handling Added** --> NOT IMPLEMENTED, but can in clude this error handling for better UI directly

Gemini sometimes returns 503 `model overloaded`.

We added:

```python
if e.code == 503:
    return "Gemini model is temporarily overloaded..."
```

This ensures graceful degradation.

---

# **4.4 AWS Configuration Completed**

## **4.4.1 Secrets Manager**

Gemini API key stored in:

```
gemini/api-key/dev
```

Lambda can read it securely using:

```python
boto3.client("secretsmanager").get_secret_value(...)
```

## **4.4.2 No Lambda Layers Required**

Removed heavy Google SDK.

Using pure `urllib` avoids native binaries.



# **5. Final Architecture for Phases 3 & 4**

**QueryRagLambda:**

* `bedrock-runtime` for Titan embeddings
* `s3vectors` for vector search
* invokes `GeminiLambda`
* returns `question + chunks + answer`

**GeminiLambda:**

* reads Secrets Manager for API key
* builds RAG prompt
* calls Gemini via REST
* returns grounded answer

Together, these complete the **Retriever + Generator** loop of the cloud-based RAG system.