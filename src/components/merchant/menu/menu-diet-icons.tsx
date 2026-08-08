"use client";

import type { ComponentType } from "react";
import { ChefHat, Flame, Flower2, Vegan, WheatOff } from "lucide-react";

import { DIET_LABELS, DIET_TAGS, SPICE_LABELS, type DietTag } from "@/lib/menu/types";

/**
 * Diet + heat marks for dish cards. Veg and non-veg keep the printed Indian
 * square-dot symbol guests already read on packaging; the rest use line icons.
 */

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number }>;

const DIET_ICONS: Partial<Record<DietTag, IconComponent>> = {
  vegan: Vegan,
  jain: Flower2,
  gluten_free: WheatOff,
  chef_choice: ChefHat,
};

export function DietIcon({ tag, size = 13 }: { tag: DietTag; size?: number }) {
  const Icon = DIET_ICONS[tag];
  const label = DIET_LABELS[tag];
  return (
    <span
      className={`menu-diet-icon menu-diet-icon--${tag}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {Icon ? (
        <Icon size={size} strokeWidth={2.4} />
      ) : (
        <span className="menu-diet-mark" aria-hidden="true" />
      )}
    </span>
  );
}

/** Every mark on a dish, always in the same order so cards scan alike. */
export function DietIconRow({ diet, size }: { diet: DietTag[]; size?: number }) {
  const tags = DIET_TAGS.filter((tag) => diet.includes(tag));
  if (tags.length === 0) return null;
  return (
    <span className="menu-diet-icons">
      {tags.map((tag) => (
        <DietIcon key={tag} tag={tag} size={size} />
      ))}
    </span>
  );
}

/** One chilli per heat step — level 0 or null shows nothing. */
export function SpiceIcons({ level, size = 12 }: { level: number | null; size?: number }) {
  if (level == null) return null;
  const steps = Math.min(SPICE_LABELS.length - 1, Math.max(0, Math.round(level)));
  if (steps === 0) return null;
  const label = `${SPICE_LABELS[steps]} spice`;
  return (
    <span className="menu-spice" role="img" aria-label={label} title={label}>
      {Array.from({ length: steps }, (_, index) => (
        <Flame key={index} size={size} strokeWidth={2.6} />
      ))}
    </span>
  );
}
