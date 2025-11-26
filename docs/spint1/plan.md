Phase plan coming right up 😄
Let’s turn this into 5 clear build phases you can actually follow.

---

## Phase 1 – Skeleton + Infra Setup

**Goal:** Have the *bare bones* AWS + code structure ready.

1. **Create repos & structure**

   1. One folder per Lambda:

      * `lambdas/index_pdf/`
      * `lambdas/chunk_embed/`
      * `lambdas/query_rag/`
      * `lambdas/gemini_llm/`
   2. Common `utils/` for shared code (chunking, Bedrock call, etc.).

2. **Create core AWS resources**

   1. S3 bucket `paper-pdfs` (for raw PDFs).
   2. (Optional) S3 bucket `paper-texts` (for extracted text).
   3. S3 **vector bucket** `paper-vectors`:

      * Create vector bucket + index `paper-chunks`.
      * Configure:

        * `filterableMetadataKeys`: `["user_id", "paper_id"]`
        * `nonFilterableMetadataKeys`: `["source_text"]`
   4. Store:

      * `GEMINI_API_KEY` in Secrets Manager or as env var (temp).
      * Bedrock access: enable Titan embeddings in chosen region.

3. **Hook up S3 → Lambda trigger**

   1. Configure S3 `paper-pdfs` → `IndexPdfLambda` on `ObjectCreated`.

✅ **End of Phase 1 checkpoint:**
All 4 Lambdas deployed (even with stub handlers), S3 buckets exist, S3→Lambda trigger works (logs show Lambda firing on upload).

---

## Phase 2 – PDF → Text → Chunks + Embeddings Pipeline

**Goal:** Upload a PDF and see embeddings land in S3 Vectors.

1. **Implement `IndexPdfLambda`**

   1. Download PDF from S3 event.
   2. Use `pypdf` to extract text only.
   3. Save text to `paper-texts` as `user/{user_id}/papers/{paper_id}.txt`.
   4. Invoke `ChunkAndEmbedLambda` asynchronously with payload:

      * `user_id`, `paper_id`, `text_s3_bucket`, `text_s3_key`.

2. **Implement `ChunkAndEmbedLambda`**

   1. Read text from `paper-texts` bucket.
   2. Implement `chunk_text(full_text, max_chars=2000)` (fixed-size).
   3. Implement `embed_text` using **Bedrock Titan embeddings V2**.
   4. Loop chunks:

      * Generate embedding.
      * Build vector payload:

        * `key = "user/{user_id}/papers/{paper_id}/chunks/{chunk_id}"`
        * `metadata = { "user_id", "paper_id", "source_text" }`
      * Call `PutVectors` on S3 Vectors (batch in groups of ~50).

3. **Test this pipeline**

   1. Upload a small PDF.
   2. Check:

      * `paper-texts` has `.txt` file.
      * S3 Vectors index has vectors for that paper (via CLI / SDK).
      * Metadata includes `source_text` and IDs.

✅ **End of Phase 2 checkpoint:**
For any uploaded PDF, you can see chunk embeddings + raw text stored in S3 Vectors successfully.

---

## Phase 3 – QueryRagLambda (Vector Search Only)

**Goal:** Given a question, return the top-K chunk texts (no Gemini yet).

1. **Implement `QueryRagLambda` basic**

   1. Input event shape (for now):

      ```json
      { "user_id": "user123", "paper_ids": ["paper456"], "question": "..." }
      ```
   2. Embed the question using same Titan embeddings.
   3. Build S3 Vectors filter:

      * `user_id = user123`
      * `paper_id in paper_ids` (optional).
   4. Call `QueryVectors`:

      * `topK = 10`
      * `returnMetadata = true`
   5. Extract `source_text` from metadata for each hit.
   6. Return:

      ```json
      {
        "top_k_chunks": [
          { "text": "...chunk1...", "rank": 1 },
          { "text": "...chunk2...", "rank": 2 }
        ]
      }
      ```

2. **Test in isolation**

   1. Manually invoke `QueryRagLambda` from AWS console:

      * Use a question relevant to the test PDF.
   2. Confirm:

      * You get non-empty `top_k_chunks`.
      * `source_text` is actually that chunk’s content.

✅ **End of Phase 3 checkpoint:**
You have a working RAG *retriever*: question → embedding → vector search → top-K chunk texts.

---

## Phase 4 – Gemini Lambda + Full RAG Answer

**Goal:** Wire QueryRagLambda → GeminiLambda and get real answers.

1. **Implement `GeminiLambda`**

   1. Input:

      ```json
      {
        "question": "...",
        "chunks": ["chunk1 text...", "chunk2 text...", ...]
      }
      ```
   2. Build prompt:

      * System message: use-only-context, don’t hallucinate.
      * Context block with numbered `[CHUNK i]`.
      * Append user question.
   3. Call Gemini REST API:

      * Use `GEMINI_API_KEY`.
      * Parse `candidates[0].content.parts[0].text` (or equivalent).
   4. Return:

      ```json
      { "answer": "LLM answer text..." }
      ```

2. **Update `QueryRagLambda`**

   1. After computing `chunk_texts`, invoke `GeminiLambda` synchronously:

      ```python
      payload = { "question": question, "chunks": chunk_texts }
      ```
   2. Return Gemini answer as REST response:

      ```json
      {
        "answer": "...",
        "chunks_used": [...]
      }
      ```

3. **End-to-end test**

   1. Upload PDF → wait for indexing.
   2. Manually invoke `QueryRagLambda` with a real question.
   3. Confirm you get a sensible Gemini answer that uses the paper context.

✅ **End of Phase 4 checkpoint:**
You now have a minimal, working RAG system: upload PDF → index → ask question → RAG answer via Gemini.

---

## Phase 5 – Hardening, Integration, & Extras

**Goal:** Make it feel like a proper Cloud Computing project, not a demo script.

1. **Add chat + user context**

   1. Add DynamoDB `Chats` and `Messages` tables (if you want ChatGPT-like history).
   2. Extend `QueryRagLambda` to:

      * Accept `chat_id`.
      * Load recent chat history for context (optional).
   3. Log each Q&A pair into `Messages`.

2. **Security & config**

   1. Use **IAM roles**:

      * Lambda roles with least-privilege S3, S3 Vectors, Bedrock.
   2. Move:

      * `GEMINI_API_KEY` to Secrets Manager.
      * Bucket/index names & region to env vars.

3. **Monitoring & logging**

   1. Add CloudWatch logs in each Lambda:

      * Timing for embedding calls.
      * Number of chunks per document.
      * Vector query timings.
   2. (Nice extra) Add X-Ray tracing for the RAG path.

4. **Simple frontend / Postman tests**

   1. Expose `QueryRagLambda` via API Gateway or AppSync.
   2. Hit it from:

      * Postman,
      * Or a small React page with a text box + answer area.

5. **Write-up for professor**

   1. Architecture diagram:

      * S3 PDFs → Λ1 → S3 Text → Λ2 → S3 Vectors → Λ3 → Λ4 (Gemini).
   2. Explain:

      * Why Bedrock embeddings + S3 Vectors (cost + serverless).
      * Why Gemini for final LLM (cross-cloud RAG).
      * Decoupling of Lambdas for scalability & maintainability.

✅ **End of Phase 5 checkpoint:**
You have a clean, multi-phase, explainable system that looks **properly cloud-native** and is easy to demo.
