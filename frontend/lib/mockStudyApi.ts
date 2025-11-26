export type MockStartSessionPayload = {
  sessionName: string;
  maxHours: number;
};

export function mockStartSession(payload: MockStartSessionPayload) {
  return Promise.resolve({
    user_id: "dev-user",
    status: "COLLECTING",
    ...payload
  });
}

export function mockStartChat() {
  return new Promise<{ status: "READY" }>((resolve) =>
    setTimeout(() => resolve({ status: "READY" }), 500)
  );
}

export function mockAsk(question: string) {
  return new Promise<{ question: string; answer: string }>((resolve) =>
    setTimeout(
      () =>
        resolve({
          question,
          answer: "Mocked RAG answer. The real backend will stream grounded replies."
        }),
      700
    )
  );
}

