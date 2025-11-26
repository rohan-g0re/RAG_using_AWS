"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudySession } from "../../lib/useStudySession";
import { mockAsk } from "../../lib/mockStudyApi";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const uniqueId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
};

export default function ChatPage() {
  const router = useRouter();
  const [state, actions] = useStudySession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (state.status === "IDLE") {
      router.replace("/");
      return;
    }
    if (state.status !== "READY") {
      router.replace("/resources");
    }
  }, [state.status, router]);

  const resourceList = useMemo(
    () =>
      state.resources.map((resource) => ({
        label: resource.title,
        source: resource.source
      })),
    [state.resources]
  );

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const id = uniqueId("user");
    setMessages((prev) => [...prev, { id, role: "user", content: trimmed }]);
    setInput("");
    setIsThinking(true);

    try {
      const response = await mockAsk(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: uniqueId("assistant"),
          role: "assistant",
          content: response.answer
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const endSession = () => {
    setShowSummary(true);
  };

  const confirmEnd = () => {
    actions.reset();
    setShowSummary(false);
    router.push("/");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/40 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-300">
            Ready
          </p>
          <h2 className="text-2xl font-semibold text-white">{state.sessionName}</h2>
          <p className="text-sm text-slate-400">
            Max {state.maxHours} hour window · {resourceList.length} resources indexed
            soon.
          </p>
        </div>
        <button
          type="button"
          onClick={endSession}
          className="rounded-full border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-200 transition hover:border-red-400 hover:text-red-100"
        >
          End session
        </button>
      </header>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/30 p-5">
        <div className="flex flex-col gap-4">
          <div className="h-80 overflow-y-auto rounded-xl border border-slate-800/60 bg-slate-900/50 p-4">
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">
                Ask your first question to kick off the mocked chat loop.
              </p>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <p
                      className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                        message.role === "user"
                          ? "bg-brand-500/80 text-white"
                          : "bg-slate-800/80 text-slate-100"
                      }`}
                    >
                      {message.content}
                    </p>
                  </div>
                ))}
                {isThinking && (
                  <p className="text-xs text-slate-500">Mock assistant is thinking…</p>
                )}
              </div>
            )}
          </div>

            <form onSubmit={handleSend} className="space-y-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={3}
                placeholder="Ask with context, e.g. “Summarize the methods across the added PDFs.”"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus-visible:border-brand-400"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  Responses are mocked for Phase 1. Backend wiring starts in Phase 3.
                </p>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-brand-500/40 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  Send
                </button>
              </div>
            </form>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Resources in scope
        </p>
        {resourceList.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No resources yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            {resourceList.map((resource, index) => (
              <li key={`${resource.label}-${index}`} className="rounded-xl border border-slate-800/70 px-4 py-2">
                <p className="font-medium">{resource.label}</p>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Source: {resource.source}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Session summary</h3>
            <p className="text-sm text-slate-400">
              Mocked duration: {state.maxHours} hour window. Resources reviewed:{" "}
              {resourceList.length}.
            </p>
            <ul className="space-y-2 text-sm text-slate-200">
              {resourceList.map((resource, index) => (
                <li key={`${resource.label}-summary-${index}`}>{resource.label}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSummary(false)}
                className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200"
              >
                Keep chatting
              </button>
              <button
                type="button"
                onClick={confirmEnd}
                className="rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

