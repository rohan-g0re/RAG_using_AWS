# Phase 3 & Phase 4 Completion Report – Cloud RAG System

This document summarizes **everything implemented, verified, debugged, and validated** in Phase 3 and Phase 4 of the Cloud RAG project. It is written to serve as a **technical proof** of backend functionality for the Cloud Computing course and for onboarding teammates.

---

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

### **3. Build S3 Vectors Query Filter**

Filter includes:

* `user_id = <user>`
* `paper_id IN [list]`

Constructed filter example:

```json
{
  "$and": [
    {"user_id": {"$eq": "dev-user"}},
    {"paper_id": {"$in": ["History_of_ML", "Cloud_Computing_Paper_Review"]}}
  ]
}
```

### **4. Query S3 Vectors index**

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

### **5. Extract top-K chunks**

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

### **6. Optionally invoke GeminiLambda**

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

### **7. Combine final answer**

QueryRagLambda returns:

```json
{
  "question": "...",
  "top_k_chunks": [...],
  "answer": "final grounded answer"
}
```

---

# **3. Phase 3 – AWS Configuration Completed**

## **3.1 IAM Permissions**

Added inline policy to `rag-lambda-exec-role`:

* `s3vectors:QueryVectors`
* `s3vectors:GetVectors`
* `lambda:InvokeFunction` (for GeminiLambda)

Full policy applied:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": "arn:aws:lambda:us-east-1:<acct>:function:GeminiLambda"
    }
  ]
}
```

## **3.2 Functional Validation**

### When testing QueryRagLambda:

* Vector search succeeded.
* Filter correctly matched only user-specific vectors.
* Top-K chunks were returned.
* GeminiLambda was successfully invoked.
* Response from GeminiLambda appeared in logs.

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

Strict grounding ensures  **no hallucination** .

## **4.3 Error Handling Added**

Gemini sometimes returns 503 `model overloaded`.

We added:

```python
if e.code == 503:
    return "Gemini model is temporarily overloaded..."
```

This ensures graceful degradation.

---

# **5. Phase 4 – AWS Configuration Completed**

## **5.1 Secrets Manager**

Gemini API key stored in:

```
gemini/api-key/dev
```

Lambda can read it securely using:

```python
boto3.client("secretsmanager").get_secret_value(...)
```

## **5.2 No Lambda Layers Required**

Removed heavy Google SDK.

Using pure `urllib` avoids native binaries.

---

# **6. End-to-End Validation Summary**

A single request to QueryRagLambda produced full end-to-end success.

### **Request**

```json
{
  "user_id": "dev-user",
  "paper_ids": ["History_of_ML", "Cloud_Computing_Paper_Review"],
  "question": "What is BigQuery --- xoxo ?",
  "top_k": 2,
  "invoke_gemini": true
}
```

### **Retriever Output (Top-K chunks)**

S3 Vectors returned the two most relevant BigQuery chunks.

### **Gemini Output**

GeminiLambda returned:

```
BigQuery is a cloud-powered, fully-managed query service from Google...
```

A correct, grounded answer synthesizing both chunks.

### **CloudWatch Confirmation**

Logs confirmed:

* QueryRagLambda → S3 Vectors → GeminiLambda path
* Full prompt construction
* LLM call with valid response
* No runtime errors

---

# **7. Final Architecture for Phases 3 & 4**

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

---

# **8. Deliverables Ready for Presentation**

* Fully functional multi-Lambda RAG pipeline
* S3 Vectors as vector database
* Titan Embeddings for semantic retrieval
* Gemini LLM for grounded generation
* Proper IAM permissions
* Robust error handling
* Full CloudWatch observability
* Ability to delete/rebuild indices during development

---

# **9. Next Steps (Phase 5)**

Ready to implement:

* API Gateway endpoints for frontend
* Cognito authentication (Login/Signup)
* DynamoDB tables for Users, Papers, Chats, Messages
* Chat session persistence
* React/Flutter-based chat UI
* Upload PDF via presigned URLs

---

# **End of Phase 3 & 4 Report**

This report covers **all technical, architectural, and implementation details** required to demonstrate the fully working backend retrieval/generation pipeline for the Cloud Computing project.
