import { useEffect, useState } from "react";

function getApiBaseUrl(): string {
  // Check environment variable first
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  // If running in browser, use current hostname
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  }

  // Fallback for server-side rendering
  return "http://localhost:8000";
}

export function useApiBaseUrl() {
  const [baseUrl, setBaseUrl] = useState(() => getApiBaseUrl());

  useEffect(() => {
    // Update if window becomes available (client-side hydration)
    if (typeof window !== "undefined") {
      const newUrl = getApiBaseUrl();
      if (newUrl !== baseUrl) {
        setBaseUrl(newUrl);
      }
    }
  }, [baseUrl]);

  return baseUrl;
}


