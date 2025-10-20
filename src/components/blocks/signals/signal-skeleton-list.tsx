import { Skeleton } from "@/components/ui/skeleton";

export function SignalSkeletonList() {
  return (
    <section className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border bg-background/70 p-4 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <Skeleton className="h-6 w-24 rounded-full sm:w-28" />
              <Skeleton className="h-6 w-28 rounded-full sm:w-32" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-16 sm:w-20" />
              <Skeleton className="h-9 w-16 sm:w-20" />
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-muted/50 p-3 sm:mt-4 sm:p-4">
            <div className="space-y-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <Skeleton className="h-3 w-12 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-4/5 rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
