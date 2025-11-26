"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type {
  StudyResource,
  StudySessionActions,
  StudySessionState
} from "./sessionTypes";

const createDefaultState = (): StudySessionState => ({
  status: "IDLE",
  sessionName: "",
  maxHours: 1,
  totalPapers: 0,
  indexedPapers: 0,
  resources: []
});

const defaultState = createDefaultState();

const makeTempId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
};

const StudySessionContext = createContext<
  [StudySessionState, StudySessionActions] | undefined
>(undefined);

export function StudySessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StudySessionState>(defaultState);

  const actions = useMemo<StudySessionActions>(() => {
    const addResource = (resource: StudyResource) =>
      setState((prev) => ({
        ...prev,
        totalPapers: prev.totalPapers + 1,
        resources: [...prev.resources, resource]
      }));

    return {
      startSession: ({ sessionName, maxHours }) => {
        setState({
          status: "COLLECTING",
          sessionName,
          maxHours,
          totalPapers: 0,
          indexedPapers: 0,
          resources: []
        });
      },
      addUploadResource: (title) => {
        addResource({
          paperId: makeTempId("tmp-upload"),
          title,
          source: "upload",
          status: "ADDED"
        });
      },
      addArxivResource: ({ id, title }) => {
        addResource({
          paperId: id ? `tmp-arxiv-${id}` : makeTempId("tmp-arxiv"),
          title,
          source: "arxiv",
          status: "ADDED"
        });
      },
      markReady: () => {
        setState((prev) => ({
          ...prev,
          status: "READY",
          indexedPapers: prev.totalPapers
        }));
      },
      reset: () => setState(createDefaultState())
    };
  }, []);

  return (
    <StudySessionContext.Provider value={[state, actions]}>
      {children}
    </StudySessionContext.Provider>
  );
}

export function useStudySession() {
  const ctx = useContext(StudySessionContext);
  if (!ctx) {
    throw new Error("useStudySession must be used within StudySessionProvider");
  }
  return ctx;
}

