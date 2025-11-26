"use client";

import { FormEvent, useState } from "react";
import { useApiBaseUrl } from "../lib/useApiBaseUrl";

export type PaperResult = {
  source: string;
  id: string;
  title: string;
  authors: string[];
  published?: string;
  url?: string;
  abstract_snippet?: string;
};

type SearchCardProps = {
  onAddToSession?: (paper: PaperResult) => void;
};

export default function SearchCard({ onAddToSession }: SearchCardProps) {
  const API_BASE_URL = useApiBaseUrl();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaperResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      setError("Type a keyword or phrase to search.");
      return;
    }

    setIsSearching(true);
    setError(null);
    setResults([]);

    try {
      const url = new URL(`${API_BASE_URL}/search`);
      url.searchParams.set("query", query.trim());
      url.searchParams.set("limit", "5");

      console.log(`[SearchCard] Searching with URL: ${url.toString()}`);
      const res = await fetch(url.toString());

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message =
          payload?.detail ||
          `Search failed with status ${res.status} ${res.statusText}`;
        console.error(`[SearchCard] Search failed:`, { status: res.status, payload });
        throw new Error(message);
      }

      const data = (await res.json()) as PaperResult[];
      console.log(`[SearchCard] Search successful, got ${data.length} results`);
      setResults(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong while searching.";
      console.error(`[SearchCard] Search error:`, err);
      setError(message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 shadow-soft">
      <div>
        <h2 className="text-sm font-semibold text-slate-50">Search literature</h2>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium text-slate-300">
            Keyword or topic
          </label>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. transformer-based summarization, graph neural networks..."
            className="w-full rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 shadow-sm focus-visible:border-brand-400"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            disabled={isSearching}
            className="inline-flex items-center justify-center rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-400/60"
          >
            {isSearching ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-900 border-b-transparent" />
                Searching…
              </span>
            ) : (
              "Run search"
            )}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          {error}
        </p>
      )}

      {!error && !isSearching && results.length === 0 && (
        <p className="text-[11px] text-slate-500">
          No results yet. Run a search to see papers based on your search.
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-1 space-y-3 overflow-y-auto rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 max-h-72">
          {results.map((paper) => (
            <article
              key={`${paper.source}-${paper.id}`}
              className="rounded-lg border border-slate-800/80 bg-slate-900/80 p-3 text-xs text-slate-100"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[11px] font-semibold leading-snug text-slate-50">
                  {paper.title}
                </h3>
                <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-300">
                  {paper.source}
                </span>
              </div>

              <p className="mt-1 text-[10px] text-slate-400">
                {paper.authors.slice(0, 3).join(", ")}
                {paper.authors.length > 3 && " et al."}{" "}
                {paper.published && (
                  <span className="text-slate-500">· {paper.published}</span>
                )}
              </p>

              {paper.abstract_snippet && (
                <p className="mt-2 line-clamp-3 text-[10px] text-slate-300">
                  {paper.abstract_snippet}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {paper.url ? (
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-300 hover:text-brand-200"
                    >
                      Open paper
                      <span aria-hidden="true">↗</span>
                    </a>
                  ) : (
                    <span className="text-[10px] text-slate-500">
                      No external link available
                    </span>
                  )}
                  {onAddToSession && (
                    <button
                      type="button"
                      onClick={() => onAddToSession(paper)}
                      className="rounded-full border border-slate-700/70 px-3 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-brand-400 hover:text-brand-200"
                    >
                      Add to session
                    </button>
                  )}
                </div>
                <span className="text-[9px] text-slate-500">
                  ID:{" "}
                  <span className="font-mono text-[9px] text-slate-400">
                    {paper.id}
                  </span>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


