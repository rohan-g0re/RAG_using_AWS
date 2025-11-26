"use client";

import { useCallback, useState } from "react";
import { useApiBaseUrl } from "./useApiBaseUrl";

export type UploadResponse = {
  bucket: string;
  key: string;
  message: string;
  title?: string;
};

export function useUploadToLibrary() {
  const API_BASE_URL = useApiBaseUrl();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<UploadResponse | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setError(null);
      setResponse(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        console.log(`[useUploadToLibrary] Uploading to: ${API_BASE_URL}/upload`);
        const res = await fetch(`${API_BASE_URL}/upload`, {
          method: "POST",
          body: formData
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          const message =
            payload?.detail ||
            `Upload failed with status ${res.status} ${res.statusText}`;
          console.error(`[useUploadToLibrary] Upload failed:`, { status: res.status, payload });
          throw new Error(message);
        }

        const data = (await res.json()) as UploadResponse;
        console.log(`[useUploadToLibrary] Upload successful:`, data);
        setResponse(data);
        return data;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong while uploading.";
        console.error(`[useUploadToLibrary] Upload error:`, err);
        setError(message);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [API_BASE_URL]
  );

  return {
    upload,
    isUploading,
    error,
    response,
    resetResponse: () => setResponse(null),
    clearError: () => setError(null)
  };
}

