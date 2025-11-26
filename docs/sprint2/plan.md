Here’s an **ultra-detailed 6-phase plan** that respects *everything* you decided:

* 3 global buckets (pdf / text / vectors) with **per-user prefixes**
* **SQS → IndexPdfLambda → ChunkAndEmbedLambda**
* **API Gateway** for *our* APIs (search backend stays as is)
* Frontend has full **study-session flow** with “wait until indexed” screen
* Only **one active session per user**, keyed by `user_id` (no session_id)

We’ll now have **6 phases**:

1. **Phase 1 – Frontend UX & Flows (No Real Backend)**
2. **Phase 2 – Cloud Infra Definitions (Buckets, Tables, Queues, API Gateway skeleton)**
3. **Phase 3 – Study API & Resource Ingestion Contracts**
4. **Phase 4 – SQS-Driven Indexing (IndexPdfLambda + ChunkAndEmbedLambda)**
5. **Phase 5 – QueryRag + Gemini Chat Path**
6. **Phase 6 – End Session, Cleanup & Polish**

I’ll go **phase by phase**, with: goal, assumptions, and ultra-detailed tasks.

---

## Phase 1 – Frontend UX & Flows (No Real Backend)

**Goal:**
Have the **entire user experience** implemented in Next.js with clear UI components and *fake/mocked* API calls, so that the full happy path works visually:

> Home → Start Study Session → Gather Resources → Chat with Resources → End Session

**Assumptions:**

* You already have a basic Next.js app and a search page calling the other team’s search API.
* For this phase, **our study APIs are mocked** (e.g., Next.js `/api` routes or local mocks).
* Hardcode `user_id = "dev-user"` on frontend.

### 1.1 Define front-end “state machine” for study session (in code, not infra)

Represent the study state in the front-end:

* `status: "IDLE" | "COLLECTING" | "INDEXING" | "READY" | "ENDED"`

And associated metadata:

* `sessionName: string`
* `maxHours: number (1–5)`
* `totalPapers: number`
* `indexedPapers: number`
* `resources: Array<{ paperId, title, source: "upload" | "arxiv", status: "ADDED" }>`

Store this in e.g.:

* React context (`StudySessionContext`)
  or
* Simple global store (Zustand/Redux)
  or
* Per-page state passed via URL query.

For now, **frontend owns this state**; backend will own it later.

### 1.2 Home screen – “Start Study Session”

Implement a Home route, e.g. `/`:

* Show a central **“Start Study Session”** button.
* On click: open modal or redirect to `/start-session`.

Modal content:

1. Input: `Session Name` (text input).
2. Input: `Time in hours` (number 1–5, enforced by UI).
3. Buttons:

   * “Cancel” → back to home.
   * “Gather Resources” →

     * Locally set `status = "COLLECTING"`, `sessionName`, `maxHours`, `totalPapers = 0`.
     * Navigate to `/resources`.

No backend call yet; this is pure FE state.

### 1.3 “Gather Resources” screen

Route: `/resources`

Layout (reusing your current design):

* **Left column:** Upload PDF

  * File picker
  * List of uploaded files (local state)
  * Each shows local `paperId`, `fileName`, `source = "upload"`

* **Right column:** Search

  * Search box → calls **existing search API** (other team)
  * Renders a list of search results (title, authors, abstract, etc.)
  * For each result:

    * Existing “View on arXiv” link
    * **New** button: **“Add to Session”**

Behavior:

* **Upload PDF:**

  * When user selects file:

    * Generate client-side `paperId = "tmp-upload-uuid"` for now.
    * Push to `resources[]` in front-end state.
  * No upload to S3 yet, only local.

* **Add to Session (search result):**

  * On click:

    * Generate `paperId = "tmp-arxiv-uuid"`.
    * Add to `resources[]` with:

      * `paperId`
      * `title`
      * `source = "arxiv"`
      * `status = "ADDED"`

At the **bottom of the page**:

* Show a “Session resources summary” panel:

  * List of all `resources` with:

    * title
    * source
* Button: **“Chat with Resources”**:

  * For now:

    * If `resources.length == 0`, disable with message “Add at least one resource”.
    * On click:

      * Simulate that backend moved from COLLECTING → INDEXING → READY:

        * Immediately set `status = "READY"` (for now).
      * Navigate to `/chat`.

### 1.4 Chat screen

Route: `/chat`

Layout:

* Header:

  * Show `sessionName`, `maxHours`.

* Main:

  * Chat transcript area (scrollable).
  * Message composer (textarea + “Send”).

* Footer:

  * Button: **“End Session”**.

Behavior (mocked):

* On mount:

  * Read `status` from local FE state.
  * For this phase, assume `status == "READY"` and show input directly.

* When user types and hits “Send”:

  * Add a **user message bubble** to local `messages[]`.
  * Immediately add a fake assistant message:

    * After 1–2s timeout, append “This is a mocked answer for now.”

* When user clicks **“End Session”**:

  * Open modal:

    * Show:

      * “You studied X hours” (mock this)
      * List **resources** from FE state.
    * On “Done”:

      * Clear FE state (`status = "IDLE"`, `resources = []`, `messages = []`).
      * Navigate to Home (`/`).

✅ **Phase 1 success criteria:**

* UX feels complete and coherent.
* No real AWS yet, but:

  * You can run the app end-to-end:

    * Start session → gather resources → chat screen → end session.
  * “Add to Session” works visually for both uploads and search results.
  * Chat is interactive, albeit mocked.

---

## Phase 2 – Cloud Infra Definitions (Buckets, Tables, Queues, API Gateway)

**Goal:**
Define and create **all AWS infrastructure** needed for the real pipeline, without yet wiring real logic. Lambdas can still be stubs.

**Assumptions:**

* Next.js frontend is already using API routes `/study/...` (mocked).
* We now introduce **API Gateway + Lambdas** behind those routes but keep stub logic.

### 2.1 Formalize the backend data model (infra view)

Already conceptually defined; now encode it as IaC or at least as a clear table:

1. **S3 buckets**

   * `rp-pdfs`

     * Purpose: permanent-ish storage of PDFs during session.
     * Key pattern: `user/{user_id}/papers/{paper_id}.pdf`.
   * `rp-texts`

     * Purpose: extracted text from PDFs.
     * Key pattern: `user/{user_id}/papers/{paper_id}.txt`.
   * `rp-vectors` (S3 Vectors)

     * Purpose: vector store for chunks.
     * Index: `paper-chunks`
     * Vector key pattern: `user/{user_id}/papers/{paper_id}/chunks/{chunk_id}`.
     * Metadata schema:

       * `user_id` (filterable)
       * `paper_id` (filterable)
       * `source_text` (non-filterable).

2. **DynamoDB: `UserStudyState`**

   * PK: `user_id` (string).
   * Attributes:

     * `status`: `"IDLE" | "COLLECTING" | "INDEXING" | "READY" | "ENDED"`.
     * `total_papers`: number.
     * `indexed_papers`: number.
     * `session_name`: string.
     * `max_hours`: number.
     * `started_at`: string (ISO).
     * `ended_at`: string (ISO, optional).

3. **SQS queue**

   * Name: `pdf-processing-queue`.
   * Payload structure:

     ```json
     {
       "user_id": "dev-user",
       "paper_id": "p456",
       "pdf_bucket": "rp-pdfs",
       "pdf_key": "user/dev-user/papers/p456.pdf"
     }
     ```

4. **Lambdas**

   * `IndexPdfLambda`
   * `ChunkAndEmbedLambda`
   * `QueryRagLambda`
   * `GeminiLambda`
   * `StudyApiLambda` (fronted by API Gateway)

5. **API Gateway**

   * REST API: `research-study-api`.
   * Base path: `/study`.
   * Methods → `StudyApiLambda` (proxy integration):

     * `POST /study/start`
     * `POST /study/upload-url`
     * `POST /study/add-arxiv`
     * `POST /study/start-chat`
     * `GET  /study/state`
     * `POST /study/ask`
     * `POST /study/end`

6. **Secrets & config**

   * `GEMINI_API_KEY` in Secrets Manager or SSM.
   * Environment variables (on Lambdas):

     * `PDF_BUCKET_NAME = rp-pdfs`
     * `TEXT_BUCKET_NAME = rp-texts`
     * `VECTOR_BUCKET_NAME = rp-vectors`
     * `VECTOR_INDEX_NAME = paper-chunks`
     * `SQS_QUEUE_URL = ...`
     * `DDB_TABLE_USER_STUDY_STATE = UserStudyState`
     * `BEDROCK_REGION = us-east-1`

### 2.2 Create infra in AWS (stub logic only)

Using CloudFormation/Terraform or console:

1. **Create 3 S3 buckets.**
2. **Create S3 Vector bucket and index.**

   * Ensure index config has `filterableMetadataKeys` and `nonFilterableMetadataKeys` as needed.
3. **Create DynamoDB table `UserStudyState`.**
4. **Create SQS queue `pdf-processing-queue`.**
5. **Create Lambdas** (with minimal handler that just logs the event):

   * `IndexPdfLambda`
   * `ChunkAndEmbedLambda`
   * `QueryRagLambda`
   * `GeminiLambda`
   * `StudyApiLambda`
6. **Create IAM roles & policies**:

   * Granular roles per Lambda as described earlier.
7. **Create API Gateway REST API**:

   * Link all `/study/...` methods to `StudyApiLambda` via Lambda proxy.
   * Enable CORS for your Next.js origin.

### 2.3 Wire frontend to **real API Gateway** but keep StudyApiLambda stubbed

Update frontend:

* Replace mocked `/study/...` calls with real `fetch` to API Gateway URL (e.g. `https://xyz.execute-api.region.amazonaws.com/prod/study/...`).
* For now, `StudyApiLambda` just returns dummy JSON that matches what frontend expects.

✅ **Phase 2 success criteria:**

* All infra objects exist (buckets, Dynamo, SQS, Lambdas, API Gateway).
* Next.js is making real HTTP calls to API Gateway and getting stub JSON back.
* No RAG yet, but all wiring is real and debuggable via CloudWatch logs.


---

## Phase 3 – Study API & Upload / Add-Arxiv Flow

**Goal:** Make all “resource collection” endpoints real: starting session, uploading PDFs, and adding arxiv PDFs.

### 3.1 Implement `StudyApiLambda` routing

Inside `StudyApiLambda`, inspect `event["resource"]` + `event["httpMethod"]` and dispatch:

* `/study/start` → `handle_start`
* `/study/upload-url` → `handle_upload_url`
* `/study/add-arxiv` → `handle_add_arxiv`
* `/study/start-chat` → `handle_start_chat`
* `/study/state` → `handle_state`
* `/study/ask` → (later)
* `/study/end` → (later)

For now implement first 4 + `state`.

### 3.2 `/study/start` – initialize study state

Assume single hardcoded user (`user_id = "dev-user"`) for now.

1. Parse `{ "session_name": "...", "max_hours": 3 }` from body.
2. Upsert `UserStudyState`:

   * `status = "COLLECTING"`
   * `total_papers = 0`
   * `indexed_papers = 0`
   * `session_name`, `max_hours`
   * `started_at = now()`, `ended_at = null`
3. Return:

   ```json
   {
     "user_id": "dev-user",
     "status": "COLLECTING"
   }
   ```

### 3.3 `/study/upload-url` – presigned S3 PUT

Input: optionally `fileName`, `mimeType`.

1. Generate `paper_id = uuid()`.
2. Build S3 key: `user/dev-user/papers/{paper_id}.pdf`.
3. Generate presigned URL:

   ```python
   s3.generate_presigned_url(
       ClientMethod="put_object",
       Params={
           "Bucket": "rp-pdfs",
           "Key": key,
           "ContentType": "application/pdf"
       },
       ExpiresIn=3600
   )
   ```
4. **Increment `total_papers`** in `UserStudyState` (because a new PDF will be added).
5. Return:

   ```json
   {
     "paper_id": "p456",
     "upload_url": "...",
     "s3_key": "user/dev-user/papers/p456.pdf"
   }
   ```

Frontend:

* Uses `upload_url` to `PUT` file.
* Treats upload success as “resource added”.

### 3.4 `/study/add-arxiv` – import from search backend

Input from frontend (extracted from other team’s API):

```json
{
  "paper_title": "...",
  "pdf_url": "https://arxiv.org/pdf/....pdf"
}
```

Lambda:

1. Generate `paper_id`.
2. Download `pdf_url` (using `requests` or `urllib`).
3. Put into S3:

   * Bucket: `rp-pdfs`
   * Key: `user/dev-user/papers/{paper_id}.pdf`
4. Increment `total_papers` in Dynamo.
5. Return `{ "paper_id": "..." }`.

Search backend stays completely untouched; we only use its data.

### 3.5 `/study/state` – return current status

* Read `UserStudyState` by `user_id`.
* Return JSON:

```json
{
  "status": "COLLECTING",
  "total_papers": 3,
  "indexed_papers": 0,
  "session_name": "...",
  "max_hours": 3
}
```

Frontend uses this later for loading/progress.

✅ **Phase 3 done when:**

* You can:

  * Start a session.
  * Upload PDFs via pre-signed URLs.
  * Add arxiv PDFs via backend download.
  * See `total_papers` update in `UserStudyState`.

---

## Phase 4 – Ingestion Pipeline via SQS, Index & Embed

**Goal:** When the user hits “Chat with resources”, PDFs are queued and processed via SQS → IndexPdfLambda → ChunkAndEmbedLambda, and `UserStudyState` transitions to `READY`.

### 4.1 `/study/start-chat` – enqueue PDF processing jobs

Input: (no body needed; just uses current user).

Implementation:

1. List all PDFs for this user in `rp-pdfs`:

   * `ListObjectsV2` with prefix `user/dev-user/papers/`.
   * For each object, derive `paper_id` from filename.
2. For each PDF:

   * Send SQS message to `pdf-processing-queue` with:

     ```json
     {
       "user_id": "dev-user",
       "paper_id": "p456",
       "pdf_bucket": "rp-pdfs",
       "pdf_key": "user/dev-user/papers/p456.pdf"
     }
     ```
3. Update `UserStudyState`:

   * `status = "INDEXING"`
   * `total_papers = <count>` (if not already correct).
   * `indexed_papers = 0`.

Return simple `{ "status": "INDEXING" }`.

Frontend:

* After calling `/study/start-chat`, redirect to `/chat` and start polling `/study/state`.

### 4.2 SQS → IndexPdfLambda

Configure:

* SQS queue `pdf-processing-queue` as event source for `IndexPdfLambda`.
* Tune:

  * `BatchSize` maybe 1–3.
  * Concurrency limit if needed.

Handler:

1. For each SQS record:

   * Parse message JSON.
   * Download the PDF:

     * `get_object(Bucket=pdf_bucket, Key=pdf_key)`.
   * Extract text with `pypdf` → `full_text`.
   * Write to `rp-texts`:

     * Key: `user/{user_id}/papers/{paper_id}.txt`.
   * Invoke `ChunkAndEmbedLambda` async:

     ```json
     {
       "user_id": "dev-user",
       "paper_id": "p456",
       "text_bucket": "rp-texts",
       "text_key": "user/dev-user/papers/p456.txt"
     }
     ```

### 4.3 ChunkAndEmbedLambda – chunk + Titan + S3 Vectors + progress

Handler:

1. Read text from S3 `rp-texts`.
2. Chunk:

   * `chunk_text(full_text, max_chars=2000)` → `[chunk0, chunk1, ...]`.
3. For each chunk:

   * Call Bedrock Titan embedding:

     * `modelId="amazon.titan-embed-text-v2:0"`
     * `inputText=chunk`
     * dims e.g. 256 or 512.
   * Build vector entry:

     ```json
     {
       "key": "user/dev-user/papers/p456/chunks/chunk-0001",
       "values": {"float32": [ ... ]},
       "metadata": {
         "user_id": "dev-user",
         "paper_id": "p456",
         "source_text": "chunk text here"
       }
     }
     ```
   * Batch `PutVectors` to `rp-vectors/paper-chunks`.
4. **Update progress**:

   * `UpdateItem` on `UserStudyState`:

     * `indexed_papers = indexed_papers + 1`.
     * If `indexed_papers == total_papers`:

       * set `status = "READY"`.

### 4.4 Frontend: indexing wait screen

On `/chat` page:

1. Call `GET /study/state`:

   * If `status == "INDEXING"`:

     * Show loading view:

       * “Indexing your PDFs… (indexed_papers / total_papers)”
   * Poll every 3–5 seconds.
2. Once `status == "READY"`:

   * Hide loader, show chat input.

✅ **Phase 4 done when:**

* You can:

  * Start study session.
  * Add multiple PDFs.
  * Click “Chat with resources”.
  * See indexing progress update in UI.
  * `UserStudyState` transitions to `READY` after all PDFs embedded.

---

## Phase 5 – QueryRagLambda + Gemini + Chat UX

**Goal:** For a READY user, questions from the chat UI go through Titan → S3 Vectors → Gemini and return real answers.

### 5.1 Implement QueryRagLambda (RAG retriever)

Handler input (from StudyApiLambda):

```json
{
  "user_id": "dev-user",
  "question": "What is the main contribution?",
  "top_k": 10
}
```

Steps:

1. Embed question using Titan (same model + dims as ingestion).
2. Build S3 Vectors filter:

   ```json
   {
     "user_id": {"equals": "dev-user"}
   }
   ```
3. Call `QueryVectors` on `rp-vectors`:

   * `indexName="paper-chunks"`
   * `queryVector={"float32": question_embedding}`
   * `topK=top_k`
   * `returnMetadata=true`
   * `returnDistance=true`
4. Extract hits:

   * For each hit:

     * read `source_text` from metadata.
   * Build list `chunk_texts`.
5. Invoke `GeminiLambda` with:

   ```json
   {
     "question": "...",
     "chunks": ["chunk1 text", "chunk2 text", ...]
   }
   ```
6. Return:

   ```json
   { "answer": "...." }
   ```

### 5.2 Implement GeminiLambda

Use the Gemini HTTP API (or official SDK) to:

1. Build a prompt:

   ```text
   You are a helpful research assistant. Use ONLY the provided excerpts to
   answer the question. If the answer is not in the excerpts, say "I don't know".

   Context:
   [CHUNK 1]
   ...
   [CHUNK K]

   Question:
   ...
   ```
2. Call Gemini with that prompt and parse the answer text.
3. Return `{ "answer": "..." }`.

### 5.3 Wire `/study/ask` in StudyApiLambda

Handler:

1. Parse `question` from HTTP body.
2. (Optional) Check `UserStudyState.status`:

   * If `INDEXING` → return 409 “Still indexing”.
   * If `READY` → proceed.
3. Invoke `QueryRagLambda`:

   * with `{user_id, question, top_k}`.
4. Return its `{answer}` to frontend.

### 5.4 Frontend chat behaviour

On `/chat` page:

1. When user hits Send:

   * Append user bubble immediately.
   * Call `POST /study/ask` with `{question}`.
   * Show “model is thinking…” indicator.
2. When response arrives:

   * Append assistant bubble with `answer`.

Optional extras:

* Add simple message history local to client or store in Dynamo (later).
* Show error if backend says `"INDEXING"` or fails.

✅ **Phase 5 done when:**

* You can upload PDFs, start chat, wait for indexing, then **ask real questions and get real RAG answers** powered by Titan + S3 Vectors + Gemini.

---

## Phase 6 – End Session, Cleanup & Polish

**Goal:** Make the system cost-efficient and presentable: delete data at end, add optional “notes”, and polish for demo/report.

### 6.1 `/study/end` – main endpoint

Steps:

1. Read `UserStudyState` for `user_id`.
2. (Optional) If you stored Q&A messages:

   * Aggregate them and call `GeminiLambda` one more time:

     * “Summarize this study session into notes.”
   * Store notes in S3 (`user/{user_id}/notes/latest.txt`) or return inline.
3. **Delete S3 PDFs & texts**:

   * In `rp-pdfs`, `ListObjectsV2` with prefix `user/{user_id}/` → `DeleteObjects` in batches.
   * Same for `rp-texts`.
4. **Delete vectors in S3 Vectors**:

   * If S3 Vectors supports filtered deletion by `user_id`, use that.
   * If not:

     * During ingestion, log all vector keys per `paper_id` to a small table `UserPaperVectors`.
     * Here, iterate and delete via `DeleteVectors` calls.
   * For the project, even a “best-effort” delete is fine as long as you can explain it.
5. Update `UserStudyState`:

   * `status="ENDED"`
   * `ended_at = now()`
   * `total_papers = 0`
   * `indexed_papers = 0`
6. Return response:

   ```json
   {
     "status": "ENDED",
     "session_name": "...",
     "duration_minutes": 132,
     "resources_count": N,
     "notes": "optional summary text"
   }
   ```

### 6.2 Frontend: End Session UX

1. On clicking “End session”:

   * Call `POST /study/end`.
2. Show popup:

   * “You studied for X hours Y minutes”
   * “You used N resources”
   * Optional: show notes teaser.
3. On “Done”:

   * Clear any local chat state.
   * Navigate back to Home (“Start Study Session” view).

### 6.3 Hardening / nice-to-haves

* **Logging & Metrics**

  * Add CloudWatch logs for:

    * SQS processing time per PDF.
    * Number of chunks per paper.
    * Time for vector query + Gemini call.
  * Maybe custom metrics: `PDFProcessedCount`, `QuestionsAnsweredCount`.
* **Config**

  * Move constants to env vars:

    * Bucket names
    * SQS queue URL
    * Bedrock region
    * Top_k default
* **Docs & Diagrams**

  * Sequence diagram:

    * Upload / Add arxiv → Start chat → SQS → Index → Chunk+Embed → Query+Gemini.
  * Component diagram:

    * Next.js / API Gateway / Lambdas / S3 / SQS / Dynamo / S3 Vectors / Gemini.

✅ **Phase 6 done when:**

* Ending a session actually cleans up S3 + vectors.
* You have notes/summary support if you want it.
* Everything is documented and ready to show to professor as a **clean, multi-service, cost-aware cloud architecture**.
