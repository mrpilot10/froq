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
 *
 * Channel topics must be unique: `supabase.channel(name)` returns an existing
 * channel when the topic matches, and Realtime forbids `.on("postgres_changes")`
 * after that channel has already called `.subscribe()` (joining/joined). React
 * Strict Mode remounts in the same millisecond, so `Date.now()` alone is not
 * enough to avoid collisions.
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
    // Ignore CLOSED/ERROR callbacks fired by an intentional removeChannel.
    let tearingDown = false;

    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };

    const dropChannel = (current: NonNullable<typeof channel>) => {
      tearingDown = true;
      void supabase.removeChannel(current).finally(() => {
        tearingDown = false;
      });
    };

    const subscribe = () => {
      if (disposed) return;

      // Guaranteed-unique topic so channel() never hands back a subscribed one.
      const topic = `rt:${table}:${filter ?? "all"}:${crypto.randomUUID()}`;

      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
          () => onChangeRef.current(),
        )
        .subscribe((status) => {
          if (disposed || tearingDown) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            return;
          }
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            const current = channel;
            channel = undefined;
            if (current) dropChannel(current);
            clearRetry();
            const delay = Math.min(30_000, 1_000 * 2 ** attempt);
            attempt += 1;
            retryTimer = setTimeout(subscribe, delay);
          }
        });
    };

    subscribe();

    return () => {
      disposed = true;
      clearRetry();
      if (channel) {
        const current = channel;
        channel = undefined;
        dropChannel(current);
      }
    };
  }, [table, filter]);
}
