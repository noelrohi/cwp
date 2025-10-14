"use client";

import { Scissor01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { SnipDialog } from "./snip-dialog";
import { Button } from "./ui/button";

type StreamdownWithSnipProps = {
  content: string;
  className?: string;
  disallowedElements?: string[];
  articleId: string;
  selectionSource?: "summary" | "article";
};

export function StreamdownWithSnip({
  content,
  className,
  disallowedElements,
  articleId,
  selectionSource = "article",
}: StreamdownWithSnipProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState("");
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showSnipDialog, setShowSnipDialog] = useState(false);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (!text || text.length === 0) {
        setMenuPosition(null);
        return;
      }

      if (
        selection &&
        selection.rangeCount > 0 &&
        containerRef.current?.contains(selection.anchorNode)
      ) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setSelectedText(text);
        setMenuPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuPosition && !(e.target as Element).closest("[data-snip-menu]")) {
        const selection = window.getSelection();
        if (!selection?.toString().trim()) {
          setMenuPosition(null);
          setSelectedText("");
        }
      }
    };

    document.addEventListener("selectionchange", handleSelection);
    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("selectionchange", handleSelection);
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuPosition]);

  const handleSnipClick = () => {
    const selectionText = window.getSelection()?.toString().trim();
    const textToUse =
      selectionText && selectionText.length > 0 ? selectionText : selectedText;

    if (!textToUse || textToUse.length === 0) {
      return;
    }

    setSelectedText(textToUse);
    setShowSnipDialog(true);
    setMenuPosition(null);
  };

  const handleDialogClose = () => {
    setShowSnipDialog(false);
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
  };

  return (
    <>
      <div ref={containerRef} className="relative">
        <Streamdown
          className={className}
          disallowedElements={disallowedElements}
        >
          {content}
        </Streamdown>

        {menuPosition && (
          <div
            data-snip-menu
            className="fixed z-50 animate-in fade-in-0 zoom-in-95 duration-200"
            style={{
              left: `${menuPosition.x}px`,
              top: `${menuPosition.y}px`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <Button size="sm" onClick={handleSnipClick} className="shadow-lg">
              <HugeiconsIcon icon={Scissor01Icon} size={16} />
              Snip
            </Button>
          </div>
        )}
      </div>

      {showSnipDialog && (
        <SnipDialog
          key={selectedText}
          articleId={articleId}
          defaultBack={selectedText}
          open={showSnipDialog}
          selectionSource={selectionSource}
          onOpenChange={(open) => {
            if (!open) {
              handleDialogClose();
            }
          }}
        />
      )}
    </>
  );
}
