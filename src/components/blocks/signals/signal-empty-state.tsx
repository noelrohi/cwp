export function SignalEmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-muted/70 bg-muted/20 p-8 text-center text-muted-foreground sm:p-10">
      {message ??
        "No pending signals right now. Check back after the next daily run."}
    </div>
  );
}
