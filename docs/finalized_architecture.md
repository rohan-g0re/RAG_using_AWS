# 1. Final architecture (locked)

Services we’re using:

* **S3 (normal bucket)** – raw PDFs (`paper-pdfs`)
* **S3 (normal bucket)** – extracted text from PDFs (`paper-texts`)
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

**IMPORTANT** You’ll configure `user_id` / `paper_id` as **filterable** keys and `source_text` as a **non-filterable metadata key** when creating the index.

---

# 3. Lambda skeletons (Python)

These are not copy-paste perfect (you’ll wire IAM/regions/etc.), but they’re **structurally ready**.

---

## 3.1 Lambda 1 – `IndexPdfLambda` (PDF → text)

- **Currently** Triggered by S3 `ObjectCreated` on `paper-pdfs`.
- **Later**: 
    - should work upon an api call from a "Start Chatting" button on Frontend  
    - should be getting PDFs from a SQS Queue
---

## 3.2 Lambda 2 – `ChunkAndEmbedLambda` (text → chunks → Titan → S3 Vectors)

- **Currently** called from Lambda 1
- **LATER** should operate in the SWS Fashion 

> **Note:** The `s3vectors` client name and exact `put_vectors` params will depend on the final AWS SDK; you’ll adapt to the actual `boto3` API from the docs, but structurally this is what you’ll implement.


## 3.3 Lambda 3 – `QueryRagLambda` (question → Titan → S3 Vectors → top-K → call GeminiLambda)

- Flow is --> (question → Titan → S3 Vectors → top-K → call GeminiLambda)


## 3.4 Lambda 4 – `GeminiLambda` (RAG answer)

- We are using Gemini REST API - where inour case the exact client is plain HTTP
