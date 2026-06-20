"use client";

import { History, Plus, User } from "lucide-react";
import type { NavTab } from "@/lib/loyalty/types";

interface FloatingNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  Icon: typeof Plus;
}> = [
  { id: "collect", label: "Collect", Icon: Plus },
  { id: "history", label: "History", Icon: History },
  { id: "profile", label: "Profile", Icon: User },
];

export function FloatingNav({ activeTab, onTabChange }: FloatingNavProps) {
  return (
    <div className="nav-dock">
      <nav className="nav-bar" aria-label="Main navigation">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;

          return (
            <button
              key={id}
              type="button"
              className={`nav-item${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onTabChange(id)}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.4 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
