"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMenu } from "@/app/merchant/menu-actions";
import type { MenuCategory } from "@/lib/menu/types";

/**
 * Menu readiness for home + the Menu tab. Tables / floor ops are no longer
 * part of AI Menu setup — guests browse via the branch Menu QR.
 */
export interface MenuSetupState {
  loading: boolean;
  categories: MenuCategory[];
  itemCount: number;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMenuSetup(_branchId?: string | null): MenuSetupState {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const menu = await fetchMenu();
    setCategories(menu.categories);
    setItemCount(menu.itemCount);
    setError(menu.ok ? null : (menu.error ?? "Could not load the menu."));
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return {
    loading,
    categories,
    itemCount,
    error,
    refresh,
  };
}
