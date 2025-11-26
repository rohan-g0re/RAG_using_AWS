"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadCard from "../../components/UploadCard";
import SearchCard, { PaperResult } from "../../components/SearchCard";
import { useStudySession } from "../../lib/useStudySession";
import { mockStartChat } from "../../lib/mockStudyApi";

export default function ResourcesPage() {
  const router = useRouter();
  const [state, actions] = useStudySession();
  const [isStartingChat, setIsStartingChat] = useState(false);

  useEffect(() => {
    if (state.status === "IDLE") {
      router.replace("/");
    }
  }, [state.status, router]);

  const handleUploadAdd = (title: string) => {
    actions.addUploadResource(title);
  };

  const handleSearchAdd = (paper: PaperResult) => {
    actions.addArxivResource({ id: paper.id, title: paper.title });
  };

  const canProceed = state.resources.length > 0 && !isStartingChat;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-300">
            Collecting
          </p>
          <h2 className="text-2xl font-semibold text-white">
            Add PDFs for {state.sessionName || "your session"}
          </h2>
          <p className="text-sm text-slate-400">
            Upload your own or add from the search feed. No real backend writes yet—just
            front-end state.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-xs font-semibold text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
        >
          Start over
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <UploadCard onResourceAdded={handleUploadAdd} />
        <SearchCard onAddToSession={handleSearchAdd} />
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/30 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Session resources
            </p>
            <p className="text-sm text-slate-300">
              {state.resources.length} selected · {state.totalPapers} total papers tracked
            </p>
          </div>
          <button
            type="button"
            disabled={!canProceed}
            onClick={async () => {
              setIsStartingChat(true);
              try {
                await mockStartChat();
                actions.markReady();
                router.push("/chat");
              } finally {
                setIsStartingChat(false);
              }
            }}
            className="inline-flex items-center justify-center rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-brand-500/30 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {isStartingChat ? "Preparing chat…" : "Chat with resources"}
          </button>
        </div>

        {state.resources.length === 0 ? (
          <p className="text-xs text-slate-500">
            Add at least one resource via upload or search to continue.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800/60 rounded-xl border border-slate-800/80 bg-slate-900/60">
            {state.resources.map((resource) => (
              <li key={resource.paperId} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-100">{resource.title}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {resource.source}
                  </p>
                </div>
                <span className="rounded-full border border-slate-800/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {resource.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

