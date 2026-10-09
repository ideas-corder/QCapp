export default function ProtectedLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <div className="flex flex-col items-center gap-3 text-stone-500">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-qc-deep"
          aria-hidden="true"
        />
        <span className="text-sm">Loading…</span>
      </div>
      <span className="sr-only">Loading page</span>
    </div>
  );
}
