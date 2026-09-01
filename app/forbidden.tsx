import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4EEF8] px-5 py-10 text-[#28154F]">
      <section className="w-full max-w-lg rounded-[28px] border border-[#D7CBE0] bg-white p-8 text-center shadow-[0_20px_60px_rgba(40,21,79,0.12)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
          403 · Forbidden
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          Finance access is restricted
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#75647F]">
          This area requires a verified Finance session and an active
          database permission.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/team-hub/management/finance"
            className="rounded-full bg-[#341F60] px-5 py-3 text-sm font-semibold text-white"
          >
            Back to Finance
          </Link>
          <Link
            href="/team-hub/dashboard"
            className="rounded-full border border-[#CDBAD9] px-5 py-3 text-sm font-semibold text-[#5F3378]"
          >
            Return to Team Hub
          </Link>
        </div>
      </section>
    </main>
  );
}
