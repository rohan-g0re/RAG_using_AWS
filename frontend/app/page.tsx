"use client";

import Link from "next/link";
import UploadCard from "../components/UploadCard";
import SearchCard from "../components/SearchCard";

export default function HomePage() {
  return (
    <>
      <div className="mb-6 flex items-center justify-end">
        <Link
          href="/start"
          className="inline-flex items-center justify-center rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-brand-500/30 transition hover:bg-brand-600"
        >
          Start study session →
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <UploadCard />
        <SearchCard />
      </div>
    </>
  );
}
