"use client";

import { useEffect, useRef } from "react";
import { createClient } from "./client";

/**
 * Subscribes to Postgres changes on a table (optionally filtered, e.g.
 * `merchant_id=eq.<id>`) and invokes `onChange` on any insert/update/delete.
 *
 * `onChange` is held in a ref, so an unstable callback re-renders freely without
 * tearing down the channel. Only a table/filter change resubscribes — rejoining
 * on every render leaves the socket permanently mid-handshake and silently drops
 * events until the page is reloaded.
 */
export function useRealtime(
  table: string,
  filter: string | undefined,
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let attempt = 0;

    const subscribe = () => {
      if (disposed) return;
      // Unique topic per attempt: reusing a topic the server still considers
      // joined makes the rejoin a no-op.
      channel = supabase
        .channel(`rt:${table}:${filter ?? "all"}:${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
          () => onChangeRef.current(),
        )
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            const current = channel;
            channel = undefined;
            if (current) void supabase.removeChannel(current);
            const delay = Math.min(30_000, 1_000 * 2 ** attempt);
            attempt += 1;
            retryTimer = setTimeout(subscribe, delay);
          }
        });
    };

    subscribe();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [table, filter]);
}
