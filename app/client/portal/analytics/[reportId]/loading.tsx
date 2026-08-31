export default function AnalyticsReportLoading() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-[1400px] animate-pulse">
        <div className="h-9 w-36 rounded-full bg-muted" />
        <div className="mt-8 h-10 w-72 rounded-xl bg-muted" />
        <div className="mt-3 h-5 w-40 rounded-lg bg-muted" />
        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="aspect-video rounded-[24px] bg-muted" />
          <div className="h-96 rounded-[24px] bg-muted" />
        </div>
      </div>
    </main>
  );
}
