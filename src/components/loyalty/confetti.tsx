"use client";

import { useEffect, useState } from "react";

interface ConfettiProps {
  active: boolean;
  onComplete?: () => void;
}

const COLORS = ["#2B6F5C", "#F5A623", "#C4456B", "#2E5BB8", "#6B4FC2", "#C9763C"];

export function Confetti({ active, onComplete }: ConfettiProps) {
  const [pieces, setPieces] = useState<
    { id: number; left: number; color: string; delay: number; size: number }[]
  >([]);

  useEffect(() => {
    if (!active) {
      setPieces([]);
      return;
    }

    const generated = Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: COLORS[i % COLORS.length] ?? COLORS[0],
      delay: Math.random() * 0.4,
      size: 5 + Math.random() * 5,
    }));

    setPieces(generated);

    const timer = setTimeout(() => {
      setPieces([]);
      onComplete?.();
    }, 2400);

    return () => clearTimeout(timer);
  }, [active, onComplete]);

  if (!active || pieces.length === 0) return null;

  return (
    <div className="confetti-container" aria-hidden="true">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            width: piece.size,
            height: piece.size,
            animationDelay: `${piece.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
