import {
  AlertCircleIcon,
  Loading03Icon,
  TickDouble02Icon,
  TimeQuarterPassIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type SignalBadgeStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed"
  | "retrying";

export interface SignalBadgeProps {
  status: SignalBadgeStatus;
  hasSummary: boolean;
}

export function SignalBadge({ status, hasSummary }: SignalBadgeProps) {
  if (status === "pending" && !hasSummary) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-muted-foreground"
        title="Not yet processed"
      >
        <HugeiconsIcon icon={TimeQuarterPassIcon} size={16} />
        <span className="text-xs font-medium">Unprocessed</span>
      </div>
    );
  }

  if ((status === "processing" || status === "retrying") && !hasSummary) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
        title="Processing transcript"
      >
        <HugeiconsIcon
          icon={Loading03Icon}
          size={16}
          className="animate-spin"
        />
        <span className="text-xs font-medium">Summarizing</span>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
        title="Processing failed"
      >
        <HugeiconsIcon icon={AlertCircleIcon} size={16} />
        <span className="text-xs font-medium">Failed</span>
      </div>
    );
  }

  if (hasSummary) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
        title="Content summarized"
      >
        <HugeiconsIcon icon={TickDouble02Icon} size={16} />
        <span className="text-xs font-medium">Summarized</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-muted-foreground"
      title="Ready for processing"
    >
      <HugeiconsIcon icon={TimeQuarterPassIcon} size={16} />
      <span className="text-xs font-medium">Pending</span>
    </div>
  );
}
