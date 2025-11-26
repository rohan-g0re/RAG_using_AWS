"use client";

import { useState, ChangeEvent, FormEvent } from "react";
import { useUploadToLibrary } from "../lib/useUploadToLibrary";

type UploadCardProps = {
  onResourceAdded?: (title: string) => void;
};

export default function UploadCard({ onResourceAdded }: UploadCardProps) {
  const { upload, isUploading, error, response, resetResponse, clearError } =
    useUploadToLibrary();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const activeError = localError ?? error;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }

    if (!selected.name.toLowerCase().endsWith(".pdf")) {
      setLocalError("Only PDF files are allowed.");
      setFile(null);
      return;
    }

    setLocalError(null);
    resetResponse();
    clearError();
    setFile(selected);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;

    if (!dropped.name.toLowerCase().endsWith(".pdf")) {
      setLocalError("Only PDF files are allowed.");
      setFile(null);
      return;
    }

    setLocalError(null);
    resetResponse();
    clearError();
    setFile(dropped);
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setLocalError("Choose a PDF to upload first.");
      return;
    }

    setLocalError(null);
    try {
      const result = await upload(file);
      onResourceAdded?.(result.title ?? file.name);
    } catch {
      // error state handled inside hook
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 shadow-soft">
      <div>
        <h2 className="text-sm font-semibold text-slate-50">Upload PDF to S3</h2>
      </div>

      <form onSubmit={handleUpload} className="flex flex-col gap-4">
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            isDragging
              ? "border-brand-400 bg-slate-900"
              : "border-slate-700/80 bg-slate-900/60 hover:border-brand-500/80"
          }`}
        >
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40">
              <span className="text-lg">⬆</span>
            </div>
            <div className="text-xs text-slate-300">
              <span className="font-medium text-slate-50">
                Drag &amp; drop a PDF
              </span>{" "}
              <span className="text-slate-400">or click to browse</span>
            </div>
            <p className="text-[11px] text-slate-500">
              We only accept PDF (.pdf) files.
            </p>
          </div>
          {file && (
            <p className="mt-3 truncate text-[11px] text-slate-300">
              Selected: <span className="font-medium">{file.name}</span>
            </p>
          )}
        </label>

        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            disabled={isUploading}
            className="inline-flex items-center justify-center rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-brand-500/40 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:shadow-none"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-b-transparent" />
                Uploading…
              </span>
            ) : (
              "Upload to S3"
            )}
          </button>
        </div>

        {activeError && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
            {activeError}
          </p>
        )}

        {response && (
          <div className="space-y-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
            <p className="font-medium">{response.message}</p>
            <p>
              Bucket:{" "}
              <span className="font-mono text-[10px]">{response.bucket}</span>
            </p>
            <p className="truncate">
              Key:{" "}
              <span className="font-mono text-[10px]">{response.key}</span>
            </p>
          </div>
        )}
      </form>
    </section>
  );
}


