"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStudySession } from "../../lib/useStudySession";
import { mockStartSession } from "../../lib/mockStudyApi";

export default function StartSessionPage() {
  const router = useRouter();
  const [, actions] = useStudySession();
  const [sessionName, setSessionName] = useState("");
  const [maxHours, setMaxHours] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!sessionName.trim()) {
      setError("Give your study session a clear name.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await mockStartSession({ sessionName: sessionName.trim(), maxHours });
      actions.startSession({ sessionName: sessionName.trim(), maxHours });
      router.push("/resources");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-300">
            Step 1
          </p>
          <h2 className="text-2xl font-semibold text-white">Define your session</h2>
          <p className="text-sm text-slate-400">
            This is still mocked, but mirrors exactly what the Study API expects.
          </p>
        </div>
        <Link
          href="/"
          className="text-xs font-semibold text-slate-400 underline-offset-4 hover:text-slate-100 hover:underline"
        >
          Back home
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Session name
          </label>
          <input
            type="text"
            value={sessionName}
            onChange={(event) => setSessionName(event.target.value)}
            placeholder="e.g. Diffusion models midterm prep"
            className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus-visible:border-brand-400"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Time cap (hours)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={5}
              value={maxHours}
              onChange={(event) => setMaxHours(Number(event.target.value) || 1)}
              className="w-24 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-white focus-visible:border-brand-400"
            />
            <p className="text-xs text-slate-500">Keep it tight: we only allow 1–5 hours.</p>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-brand-500/40 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {isSubmitting ? "Creating session..." : "Gather resources →"}
        </button>
      </form>
    </div>
  );
}

