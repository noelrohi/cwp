"use client";

import {
  CloudUploadIcon,
  Download01Icon,
  RefreshIcon,
  Database01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type VariantProps } from "class-variance-authority";
import { Button, type buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadJson } from "@/lib/download-utils";
import { useTRPC } from "@/server/trpc/client";

type ExportMode = "full" | "incremental" | "exocortex";

interface ExportDropdownProps {
  className?: string;
  size?: VariantProps<typeof buttonVariants>["size"];
}

export function ExportDropdown({ className, size }: ExportDropdownProps) {
  const trpc = useTRPC();
  const [isExporting, setIsExporting] = useState(false);

  const settingsQuery = useQuery(trpc.exports.getSettings.queryOptions());

  const exportMutation = useMutation(trpc.exports.export.mutationOptions());

  const handleExport = async (mode: ExportMode) => {
    setIsExporting(true);
    try {
      const data = await exportMutation.mutateAsync({ mode });
      const timestamp = new Date().toISOString().split("T")[0];
      downloadJson(data, `framebreak-export-${mode}-${timestamp}.json`);
      toast.success(`Exported ${data.document_count} documents`);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const lastExportDate = settingsQuery.data?.lastExportedAt
    ? new Date(settingsQuery.data.lastExportedAt).toLocaleDateString()
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={size}
          disabled={isExporting}
          className={className}
        >
          <HugeiconsIcon icon={Download01Icon} size={16} />
          {isExporting ? "Exporting..." : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => handleExport("exocortex")}>
          <HugeiconsIcon icon={CloudUploadIcon} size={16} />
          <div className="flex flex-col">
            <span>Export to Exocortex</span>
            <span className="text-xs text-muted-foreground">
              JSON with embeddings
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("incremental")}
          disabled={!lastExportDate}
        >
          <HugeiconsIcon icon={RefreshIcon} size={16} />
          <div className="flex flex-col">
            <span>Export since last sync</span>
            <span className="text-xs text-muted-foreground">
              {lastExportDate
                ? `Since ${lastExportDate}`
                : "No previous export"}
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("full")}>
          <HugeiconsIcon icon={Database01Icon} size={16} />
          <div className="flex flex-col">
            <span>Full export</span>
            <span className="text-xs text-muted-foreground">
              All saved signals
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
