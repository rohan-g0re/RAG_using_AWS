import boto3
import json
import os
from io import BytesIO
from urllib.parse import unquote_plus
from pypdf import PdfReader

# AWS clients
s3 = boto3.client("s3")
lambda_client = boto3.client("lambda")

# Environment variables
TEXT_BUCKET = os.environ.get("TEXT_BUCKET", "paper-texts")
CHUNK_EMBED_LAMBDA_ARN = os.environ.get("CHUNK_EMBED_LAMBDA_ARN")


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Convert raw PDF bytes -> concatenated plain text from all pages.
    """
    reader = PdfReader(BytesIO(pdf_bytes))
    text_parts = []
    for i, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        text_parts.append(page_text)
    return "\n".join(text_parts)


def _derive_ids_from_key(decoded_key: str):
    """
    Try to infer user_id and paper_id from the S3 object key.

    Supports:
      1) "user/<user_id>/papers/<paper_id>.pdf"
      2) "<filename>.pdf"  (fallback: user_id = 'dev-user')
    """
    parts = decoded_key.split("/")

    # Case 1: key like "user/<user_id>/papers/<paper_id>.pdf"
    if len(parts) >= 4 and parts[0] == "user" and parts[2] == "papers":
        user_id = parts[1]
        filename = parts[3]
        paper_id = filename.rsplit(".", 1)[0]
        return user_id, paper_id

    # Case 2: anything else -> fallback
    filename = parts[-1]
    paper_id = filename.rsplit(".", 1)[0]
    user_id = "dev-user"  # simple default for now
    return user_id, paper_id


def lambda_handler(event, context):
    """
    Entry point for IndexPdfLambda.
    Triggered by S3 ObjectCreated events on the PDF bucket.
    Steps:
      1) Read bucket + key from S3 event (decode key for spaces)
      2) Download PDF from S3
      3) Extract text using pypdf
      4) Save text to TEXT_BUCKET as user/<user_id>/papers/<paper_id>.txt
      5) Invoke ChunkAndEmbedLambda with metadata
    """

    # 1. Parse S3 event
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]

    raw_key = record["s3"]["object"]["key"]           # may contain + or %20 for spaces
    key = unquote_plus(raw_key)                      # decode to real S3 key

    print(f"[IndexPdfLambda] Received S3 event for bucket={bucket}, raw_key={raw_key}, decoded_key={key}")

    # 1.1 Derive user_id and paper_id
    user_id, paper_id = _derive_ids_from_key(key)
    print(f"[IndexPdfLambda] Using user_id={user_id}, paper_id={paper_id}")

    # 2. Download PDF
    obj = s3.get_object(Bucket=bucket, Key=key)
    pdf_bytes = obj["Body"].read()

    # 3. Extract text
    extracted_text = extract_text_from_pdf(pdf_bytes)
    if not extracted_text.strip():
        print("[IndexPdfLambda] WARNING: Extracted text is empty or whitespace")

    # 4. Save extracted text to TEXT_BUCKET
    text_key = f"user/{user_id}/papers/{paper_id}.txt"

    s3.put_object(
        Bucket=TEXT_BUCKET,
        Key=text_key,
        Body=extracted_text.encode("utf-8"),
    )

    print(f"[IndexPdfLambda] Extracted text stored at: s3://{TEXT_BUCKET}/{text_key}")

    # 5. Invoke ChunkAndEmbedLambda (optional if ARN is configured)
    if CHUNK_EMBED_LAMBDA_ARN:
        payload = {
            "user_id": user_id,
            "paper_id": paper_id,
            "text_s3_bucket": TEXT_BUCKET,
            "text_s3_key": text_key,
        }

        lambda_client.invoke(
            FunctionName=CHUNK_EMBED_LAMBDA_ARN,
            InvocationType="Event",  # async / fire-and-forget
            Payload=json.dumps(payload),
        )
        print(f"[IndexPdfLambda] Invoked ChunkAndEmbedLambda: {CHUNK_EMBED_LAMBDA_ARN}")
    else:
        print("[IndexPdfLambda] CHUNK_EMBED_LAMBDA_ARN not set; skipping next step invoke")

    return {
        "statusCode": 200,
        "message": "PDF processed successfully",
        "user_id": user_id,
        "paper_id": paper_id,
        "text_s3_key": text_key,
    }