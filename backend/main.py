from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import boto3
import os
import arxiv 
from semanticscholar import SemanticScholar
import PyPDF2
from io import BytesIO
from datetime import datetime
from decimal import Decimal

# Try to import ApiError
try:
    from semanticscholar.rest import ApiError
except ImportError:
    try:
        from semanticscholar import ApiError
    except ImportError:
        ApiError = Exception

from uuid import uuid4
from botocore.exceptions import BotoCoreError, ClientError
from typing import List, Dict, Optional
from dotenv import load_dotenv

# --- CONFIG ---
load_dotenv() 

AWS_REGION = "us-east-1"  
S3_BUCKET_NAME = "research-papers-cc"
DYNAMODB_TABLE = "research-papers-metadata"
SS_API_KEY = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")

# --- CLIENT INITIALIZATION ---
try:
    s3_client = boto3.client("s3", region_name=AWS_REGION)
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
    table = dynamodb.Table(DYNAMODB_TABLE)
    print(f"Successfully connected to DynamoDB table: {DYNAMODB_TABLE}")
except Exception as e:
    print(f"Failed to initialize AWS clients: {e}")
    s3_client = None
    table = None

ss_client = SemanticScholar(api_key=SS_API_KEY)
arxiv_client = arxiv.Client()

# --- FASTAPI APP ---
app = FastAPI(title="Research Paper Uploader and Search API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------
# HELPER: Extract PDF Metadata
# ----------------------------------------------------

def extract_pdf_metadata(file_bytes: bytes) -> Dict:
    """Extract title, author, and first page text from PDF."""
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(file_bytes))
        
        metadata = pdf_reader.metadata or {}
        title = metadata.get('/Title', '')
        author = metadata.get('/Author', '')
        
        # Extract first page text for abstract/keywords
        first_page_text = ""
        if len(pdf_reader.pages) > 0:
            first_page_text = pdf_reader.pages[0].extract_text()[:500]
        
        return {
            "title": str(title) if title else "Untitled Document",
            "author": str(author) if author else "Unknown",
            "page_count": len(pdf_reader.pages),
            "abstract_snippet": first_page_text
        }
    except Exception as e:
        print(f"PDF metadata extraction error: {e}")
        return {
            "title": "Untitled Document",
            "author": "Unknown",
            "page_count": 0,
            "abstract_snippet": ""
        }

# ----------------------------------------------------
# 1. UPLOAD ENDPOINT WITH DYNAMODB
# ----------------------------------------------------

@app.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    user_id: Optional[str] = "default_user"  # TODO: Get from Cognito JWT later
):
    """Handles PDF upload, extracts metadata, stores in S3 + DynamoDB."""
    
    if not s3_client or not table:
        raise HTTPException(status_code=500, detail="AWS services not initialized.")
        
    # 1. Validation
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    # 2. Read file
    file_bytes = await file.read()
    
    # 3. Extract metadata from PDF
    pdf_metadata = extract_pdf_metadata(file_bytes)
    
    # 4. Create unique IDs
    document_id = str(uuid4())
    object_key = f"uploads/{document_id}-{file.filename}"

    # 5. Upload to S3
    try:
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=object_key,
            Body=file_bytes,
            ContentType="application/pdf",
        )
        print(f"Uploaded to S3: {object_key}")
    except (BotoCoreError, ClientError) as e:
        print(f"S3 upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {e}")

    # 6. Store metadata in DynamoDB
    try:
        # DynamoDB doesn't support float, so convert page_count to Decimal if needed
        table.put_item(
            Item={
                'document_id': document_id,
                'user_id': user_id,
                'title': pdf_metadata['title'],
                'author': pdf_metadata['author'],
                'filename': file.filename,
                's3_key': object_key,
                's3_bucket': S3_BUCKET_NAME,
                'source': 'user_upload',
                'page_count': pdf_metadata['page_count'],
                'abstract_snippet': pdf_metadata['abstract_snippet'],
                'uploaded_at': datetime.utcnow().isoformat(),
                'status': 'ready'
            }
        )
        print(f"Stored metadata in DynamoDB: {document_id}")
    except Exception as e:
        print(f"DynamoDB error: {e}")
        # File is already in S3, so we don't fail completely
        raise HTTPException(status_code=500, detail=f"Failed to store metadata: {e}")

    return {
        "success": True,
        "document_id": document_id,
        "bucket": S3_BUCKET_NAME,
        "key": object_key,
        "title": pdf_metadata['title'],
        "author": pdf_metadata['author'],
        "page_count": pdf_metadata['page_count'],
        "message": "File uploaded and indexed successfully"
    }

# ----------------------------------------------------
# 2. UNIFIED SEARCH ENDPOINT (3 Sources)
# ----------------------------------------------------

@app.get("/search", response_model=List[Dict])
async def search_papers(
    query: str = Query(..., description="Search query for papers"),
    limit: int = Query(10, ge=1, le=50),
    user_id: Optional[str] = "default_user",
    include_library: bool = Query(True, description="Include papers from your S3 library")
):
    """
    Unified search across:
    1. Semantic Scholar
    2. arXiv  
    3. User's S3 library (DynamoDB metadata)
    """
    
    all_results = []
    
    # 1. Search Semantic Scholar
    try:
        if SS_API_KEY:
            ss_results = search_semantic_scholar_impl(query, limit)
            all_results.extend(ss_results)
            print(f"Semantic Scholar: {len(ss_results)} results")
    except Exception as e:
        print(f"Semantic Scholar failed: {e}")
    
    # 2. Search arXiv
    try:
        arxiv_results = search_arxiv_impl(query, limit)
        all_results.extend(arxiv_results)
        print(f"arXiv: {len(arxiv_results)} results")
    except Exception as e:
        print(f"⚠️  arXiv failed: {e}")
    
    # 3. Search User's Library (DynamoDB)
    if include_library and table:
        try:
            library_results = search_user_library(query, user_id, limit)
            all_results.extend(library_results)
            print(f"Your Library: {len(library_results)} results")
        except Exception as e:
            print(f"⚠️  Library search failed: {e}")
    
    return all_results[:limit * 2]

# ----------------------------------------------------
# 3. GET USER'S LIBRARY (ALL PAPERS)
# ----------------------------------------------------

@app.get("/library")
async def get_library(user_id: Optional[str] = "default_user"):
    """Get all papers uploaded by the user."""
    
    if not table:
        raise HTTPException(status_code=500, detail="DynamoDB not initialized.")
    
    try:
        # Scan table for all items with matching user_id
        # Note: For production, use a GSI (Global Secondary Index) on user_id
        response = table.scan(
            FilterExpression='user_id = :uid',
            ExpressionAttributeValues={':uid': user_id}
        )
        
        items = response.get('Items', [])
        
        # Sort by upload date (newest first)
        items.sort(key=lambda x: x.get('uploaded_at', ''), reverse=True)
        
        return {
            "count": len(items),
            "papers": items
        }
        
    except Exception as e:
        print(f"Library retrieval error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve library: {e}")

# ----------------------------------------------------
# 4. GET SINGLE PAPER DETAILS
# ----------------------------------------------------

@app.get("/paper/{document_id}")
async def get_paper(document_id: str):
    """Get details of a specific paper."""
    
    if not table:
        raise HTTPException(status_code=500, detail="DynamoDB not initialized.")
    
    try:
        response = table.get_item(Key={'document_id': document_id})
        
        if 'Item' not in response:
            raise HTTPException(status_code=404, detail="Paper not found")
        
        return response['Item']
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error retrieving paper: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve paper: {e}")

# ----------------------------------------------------
# 5. DELETE PAPER
# ----------------------------------------------------

@app.delete("/paper/{document_id}")
async def delete_paper(document_id: str, user_id: Optional[str] = "default_user"):
    """Delete a paper from S3 and DynamoDB."""
    
    if not s3_client or not table:
        raise HTTPException(status_code=500, detail="AWS services not initialized.")
    
    try:
        # 1. Get paper details
        response = table.get_item(Key={'document_id': document_id})
        
        if 'Item' not in response:
            raise HTTPException(status_code=404, detail="Paper not found")
        
        paper = response['Item']
        
        # 2. Verify ownership
        if paper.get('user_id') != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this paper")
        
        # 3. Delete from S3
        s3_client.delete_object(
            Bucket=paper['s3_bucket'],
            Key=paper['s3_key']
        )
        print(f"Deleted from S3: {paper['s3_key']}")
        
        # 4. Delete from DynamoDB
        table.delete_item(Key={'document_id': document_id})
        print(f"Deleted from DynamoDB: {document_id}")
        
        return {
            "success": True,
            "message": "Paper deleted successfully",
            "document_id": document_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete paper: {e}")

# ----------------------------------------------------
# HELPER: Search User's Library (DynamoDB)
# ----------------------------------------------------

def search_user_library(query: str, user_id: str, limit: int) -> List[Dict]:
    """Search papers uploaded by user in DynamoDB."""
    try:
        # Simple scan with contains filter (basic search for MVP)
        # For production, use DynamoDB + OpenSearch or implement better search
        response = table.scan(
            FilterExpression='user_id = :uid AND (contains(#title, :query) OR contains(abstract_snippet, :query))',
            ExpressionAttributeNames={'#title': 'title'},  # 'title' is a reserved word
            ExpressionAttributeValues={
                ':uid': user_id,
                ':query': query.lower()
            }
        )
        
        results = []
        for item in response.get('Items', [])[:limit]:
            results.append({
                "source": "Your Library (S3)",
                "id": item['document_id'],
                "title": item['title'],
                "authors": [item.get('author', 'Unknown')],
                "published": item.get('uploaded_at', '')[:10],
                "url": f"s3://{item['s3_bucket']}/{item['s3_key']}",
                "abstract_snippet": item.get('abstract_snippet', '')[:200] + "...",
                "in_library": True,
                "page_count": item.get('page_count', 0)
            })
        
        return results
        
    except Exception as e:
        print(f"Library search error: {e}")
        return []

# ----------------------------------------------------
# HELPER: Semantic Scholar Search
# ----------------------------------------------------

def _paper_get(paper_obj, key, default=None):
    """Helper to safely read from dict- or object-style results."""
    if isinstance(paper_obj, dict):
        return paper_obj.get(key, default)
    return getattr(paper_obj, key, default)


def search_semantic_scholar_impl(query: str, limit: int) -> List[Dict]:
    """Search Semantic Scholar API."""
    results = ss_client.search_paper(
        query=query,
        limit=limit,
        fields=['paperId', 'title', 'authors', 'publicationDate', 'url', 'abstract']
    )

    # Newer versions return a PaginatedResults object with an `items` attribute.
    if hasattr(results, "items"):
        data = results.items
    else:
        data = results.get('data', []) if isinstance(results, dict) else []

    formatted_results = []
    for paper in data:
        authors_raw = _paper_get(paper, 'authors', [])
        if not isinstance(authors_raw, list):
            # Author objects may expose `.name`; coerce to list
            authors_raw = list(authors_raw)

        formatted_results.append({
            "source": "Semantic Scholar",
            "id": _paper_get(paper, 'paperId'),
            "title": _paper_get(paper, 'title'),
            "authors": [
                author.get('name') if isinstance(author, dict) else getattr(author, 'name', 'Unknown')
                for author in authors_raw
            ],
            "published": _paper_get(paper, 'publicationDate'),
            "url": _paper_get(paper, 'url'),
            "abstract_snippet": (
                (_paper_get(paper, 'abstract') or '')[:200] + "..."
            ) if _paper_get(paper, 'abstract') else "No abstract available",
            "in_library": False
        })

    return formatted_results

# ----------------------------------------------------
# HELPER: arXiv Search
# ----------------------------------------------------

def search_arxiv_impl(query: str, limit: int) -> List[Dict]:
    """Search arXiv API."""
    search = arxiv.Search(
        query=query,
        max_results=limit,
        sort_by=arxiv.SortCriterion.SubmittedDate,
        sort_order=arxiv.SortOrder.Descending,
    )
    
    results = []
    for r in arxiv_client.results(search):
        results.append({
            "source": "arXiv",
            "id": r.entry_id.split('/')[-1],
            "title": r.title,
            "authors": [author.name for author in r.authors],
            "published": r.published.strftime("%Y-%m-%d"),
            "url": r.pdf_url,
            "abstract_snippet": r.summary[:200] + "...",
            "in_library": False
        })
        
    return results

# ----------------------------------------------------
# HEALTH CHECK
# ----------------------------------------------------

@app.get("/health")
def health():
    """Check if all services are connected."""
    return {
        "status": "ok",
        "services": {
            "s3": s3_client is not None,
            "dynamodb": table is not None,
            "semantic_scholar": SS_API_KEY is not None
        },
        "table_name": DYNAMODB_TABLE if table else None
    }

# ----------------------------------------------------
# STARTUP MESSAGE
# ----------------------------------------------------

@app.on_event("startup")
async def startup_event():
    """Print startup information."""
    print("\n" + "="*50)
    print("Research Paper API Started!")
    print("="*50)
    print(f"S3 Bucket: {S3_BUCKET_NAME}")
    print(f"DynamoDB Table: {DYNAMODB_TABLE}")
    print(f"Semantic Scholar API: {'Configured' if SS_API_KEY else 'Not configured'}")
    print("="*50 + "\n")