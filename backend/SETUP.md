# Backend Setup

## Prerequisites
- Python 3.12+
- AWS credentials configured (via `~/.aws/credentials` or environment variables)

## Installation

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Configuration

Create `.env` file in `backend/`:
```
SEMANTIC_SCHOLAR_API_KEY=your_api_key_here
```

## Run

```bash
uvicorn main:app --reload --port 8000
```

API will be available at `http://localhost:8000`

