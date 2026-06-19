"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, labelledBy, className, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={`thanks-overlay${open ? " open" : ""}${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-labelledby={labelledBy}
      onClick={handleOverlayClick}
    >
      <div className="thanks-sheet">
        <div className="sheet-handle" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
