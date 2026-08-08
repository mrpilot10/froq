"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

interface MenuSetupCardProps {
  itemCount: number;
  onChanged?: () => void;
}

/**
 * Path to a live guest menu: add dishes. Hides once the catalogue has items.
 */
export function MenuSetupCard({ itemCount }: MenuSetupCardProps) {
  const router = useRouter();
  if (itemCount > 0) return null;

  return (
    <section className="merchant-section">
      <div className="panel-card menu-home-setup">
        <div className="menu-home-setup-icon" aria-hidden>
          <Sparkles size={20} strokeWidth={2.2} />
        </div>
        <div className="menu-home-setup-copy">
          <p className="menu-home-setup-title">Add your first dishes</p>
          <p className="menu-home-setup-sub">
            Upload a photo or PDF and AI pulls the dishes out, or type them in
            yourself.
          </p>
        </div>
        <button
          type="button"
          className="menu-setup-cta is-primary menu-home-setup-cta"
          onClick={() => router.push("/merchant/menu/items")}
        >
          Add menu
        </button>
      </div>
    </section>
  );
}
