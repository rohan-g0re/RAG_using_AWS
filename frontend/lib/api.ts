// lib/api.ts
// API utility functions to connect Next.js frontend to FastAPI backend

const API_BASE_URL = 'http://localhost:8000';

// Types
export interface Paper {
  source: string;
  id: string;
  title: string;
  authors: string[];
  published: string;
  url: string;
  abstract_snippet: string;
  in_library: boolean;
  page_count?: number;
}

export interface UploadResponse {
  success: boolean;
  document_id: string;
  bucket: string;
  key: string;
  title: string;
  author: string;
  page_count: number;
  message: string;
}

export interface LibraryResponse {
  count: number;
  papers: Array<{
    document_id: string;
    user_id: string;
    title: string;
    author: string;
    filename: string;
    s3_key: string;
    s3_bucket: string;
    source: string;
    page_count: number;
    abstract_snippet: string;
    uploaded_at: string;
    status: string;
  }>;
}

// API Functions

/**
 * Search for papers across Semantic Scholar, arXiv, and user library
 */
export async function searchPapers(
  query: string,
  limit: number = 10,
  includeLibrary: boolean = true
): Promise<Paper[]> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/search?query=${encodeURIComponent(query)}&limit=${limit}&include_library=${includeLibrary}`
    );
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}

/**
 * Upload a PDF file to the library
 */
export async function uploadPDF(file: File, userId: string = 'default_user'): Promise<UploadResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);
    
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Upload failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

/**
 * Get all papers in user's library
 */
export async function getLibrary(userId: string = 'default_user'): Promise<LibraryResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/library?user_id=${userId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get library: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Get library error:', error);
    throw error;
  }
}

/**
 * Get details of a specific paper
 */
export async function getPaperDetails(documentId: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/paper/${documentId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get paper: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Get paper error:', error);
    throw error;
  }
}

/**
 * Delete a paper from the library
 */
export async function deletePaper(documentId: string, userId: string = 'default_user'): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/paper/${documentId}?user_id=${userId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Delete failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Delete error:', error);
    throw error;
  }
}

/**
 * Check backend health status
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    
    if (!response.ok) {
      throw new Error('Backend is not responding');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Health check error:', error);
    throw error;
  }
}

// Example usage in a React component:
/*

import { searchPapers, uploadPDF, getLibrary, deletePaper } from '@/lib/api';

// In your component:
const [papers, setPapers] = useState<Paper[]>([]);
const [loading, setLoading] = useState(false);

// Search
const handleSearch = async (query: string) => {
  setLoading(true);
  try {
    const results = await searchPapers(query, 10, true);
    setPapers(results);
  } catch (error) {
    console.error('Search failed:', error);
  } finally {
    setLoading(false);
  }
};

// Upload
const handleUpload = async (file: File) => {
  setLoading(true);
  try {
    const result = await uploadPDF(file);
    alert(`Uploaded: ${result.title}`);
  } catch (error) {
    console.error('Upload failed:', error);
  } finally {
    setLoading(false);
  }
};

// Get Library
const loadLibrary = async () => {
  setLoading(true);
  try {
    const library = await getLibrary();
    console.log(`You have ${library.count} papers`);
  } catch (error) {
    console.error('Failed to load library:', error);
  } finally {
    setLoading(false);
  }
};

// Delete
const handleDelete = async (documentId: string) => {
  try {
    await deletePaper(documentId);
    alert('Paper deleted successfully');
  } catch (error) {
    console.error('Delete failed:', error);
  }
};

*/