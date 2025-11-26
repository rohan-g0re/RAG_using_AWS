export type StudyStatus = "IDLE" | "COLLECTING" | "INDEXING" | "READY" | "ENDED";

export type StudyResourceSource = "upload" | "arxiv";

export type StudyResource = {
  paperId: string;
  title: string;
  source: StudyResourceSource;
  status: "ADDED";
};

export type StudySessionState = {
  status: StudyStatus;
  sessionName: string;
  maxHours: number;
  totalPapers: number;
  indexedPapers: number;
  resources: StudyResource[];
};

export type StudySessionActions = {
  startSession: (params: { sessionName: string; maxHours: number }) => void;
  addUploadResource: (title: string) => void;
  addArxivResource: (paper: { id: string; title: string }) => void;
  markReady: () => void;
  reset: () => void;
};

