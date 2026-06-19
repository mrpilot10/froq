"use client";

import { useEffect } from "react";
import { createClient } from "./client";

// Subscribes to Postgres changes on a table (optionally filtered, e.g.
// `merchant_id=eq.<id>`) and invokes `onChange` on any insert/update/delete.
// Pass a stable `onChange` (useCallback) to avoid resubscribe loops.
export function useRealtime(
  table: string,
  filter: string | undefined,
  onChange: () => void,
) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`rt:${table}:${filter ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        () => onChange(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, onChange]);
}
