"use client";

import { StudySessionProvider } from "../lib/useStudySession";

export function Providers({ children }: { children: React.ReactNode }) {
  return <StudySessionProvider>{children}</StudySessionProvider>;
}

