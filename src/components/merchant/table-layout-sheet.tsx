"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { TableLayoutEditor } from "@/components/merchant/table-layout-editor";
import {
  expandLayoutToTables,
  summarizeDiningTables,
  summarizeTableLayout,
  validateDiningTableDraft,
  type GeneratedTable,
  type TableLayoutRow,
} from "@/lib/merchant/dining-tables";
import {
  fetchBranchTableLayout,
  saveBranchDiningTables,
} from "@/app/merchant/table-actions";

interface TableLayoutSheetProps {
  open: boolean;
  branchId: string | null | undefined;
  onClose: () => void;
  onSaved?: (layout: TableLayoutRow[]) => void;
}

export function TableLayoutSheet({
  open,
  branchId,
  onClose,
  onSaved,
}: TableLayoutSheetProps) {
  const [tables, setTables] = useState<GeneratedTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !branchId) return;
    let cancelled = false;
    setLoading(true);
    void fetchBranchTableLayout({ branchId }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't load tables.");
        setTables([]);
        return;
      }
      if (result.tables.length > 0) {
        setTables(
          result.tables.map((t) => ({ number: t.number, seats: t.seats })),
        );
        return;
      }
      if (result.layout.length > 0) {
        setTables(expandLayoutToTables(result.layout));
        return;
      }
      setTables([]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, branchId]);

  const save = async () => {
    if (!branchId) {
      toast.error("Pick a branch first.");
      return;
    }
    const error = validateDiningTableDraft(tables);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      const result = await saveBranchDiningTables({ branchId, tables });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't save tables.");
        return;
      }
      toast.success(
        `Saved ${result.tables?.length ?? 0} table${
          (result.tables?.length ?? 0) === 1 ? "" : "s"
        }`,
      );
      onSaved?.(result.layout ?? []);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="table-layout-title"
      className="merchant-theme merchant-edit-drawer"
    >
      <div className="merchant-edit-sheet">
        <div className="merchant-edit-sheet-head">
          <h3 id="table-layout-title" className="merchant-edit-sheet-title">
            Tables
          </h3>
          <p className="merchant-edit-sheet-sub">
            Shared by Waitlist, Reservations, and AI Menu for this branch.
          </p>
        </div>

        <div className="merchant-edit-fields">
          {loading ? (
            <div
              className="sk"
              style={{ width: "100%", height: 140, borderRadius: 14 }}
            />
          ) : (
            <TableLayoutEditor value={tables} onChange={setTables} />
          )}

          {!loading && tables.length > 0 ? (
            <button
              type="button"
              className="cta-btn merchant-cta-accent"
              disabled={saving || !branchId}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save tables"}
            </button>
          ) : null}
        </div>
      </div>
    </BottomSheet>
  );
}

export function useTableLayoutSummary(branchId: string | null | undefined) {
  const [summary, setSummary] = useState("Not configured");
  const [layout, setLayout] = useState<TableLayoutRow[]>([]);

  const refresh = (next?: TableLayoutRow[]) => {
    if (next) {
      setLayout(next);
      setSummary(summarizeTableLayout(next));
      return;
    }
    if (!branchId) {
      setLayout([]);
      setSummary("Pick a branch");
      return;
    }
    void fetchBranchTableLayout({ branchId }).then((result) => {
      if (!result.ok) {
        setSummary("Not configured");
        setLayout([]);
        return;
      }
      setLayout(result.layout);
      setSummary(
        result.tables.length > 0
          ? summarizeDiningTables(result.tables)
          : summarizeTableLayout(result.layout),
      );
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  return { summary, layout, refresh };
}
