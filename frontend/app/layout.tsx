import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "../components/Providers";

export const metadata: Metadata = {
  title: "Cloud Research Workspace",
  description: "Upload PDFs to S3 and search research papers by keyword."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50">
        <Providers>
          <div className="flex min-h-screen items-center justify-center px-4 py-8">
            <main className="w-full max-w-5xl rounded-3xl bg-slate-900/70 p-8 shadow-soft ring-1 ring-slate-800/60 backdrop-blur">
              <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-300">
                    Cloud Research
                  </p>
                  <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Research paper hub
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-400">
                    Upload your own PDFs securely to S3 and search the literature by keyword. Clean, focused, and fast.
                  </p>
                </div>
              </header>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}


