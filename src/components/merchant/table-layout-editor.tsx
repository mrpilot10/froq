"use client";

import { useId } from "react";
import { LayoutGrid, Plus, Trash2 } from "lucide-react";
import {
  nextTableNumber,
  type GeneratedTable,
} from "@/lib/merchant/dining-tables";

interface TableLayoutEditorProps {
  value: GeneratedTable[];
  onChange: (next: GeneratedTable[]) => void;
  compact?: boolean;
}

const SIZE_OPTIONS = [2, 4, 6, 8, 10, 12];

/**
 * Editable list of individual tables. Numbers are auto-assigned when you add
 * a row, and can be changed freely (must stay unique on save).
 */
export function TableLayoutEditor({
  value,
  onChange,
  compact = false,
}: TableLayoutEditorProps) {
  const idPrefix = useId();
  const isEmpty = value.length === 0;

  const updateRow = (index: number, patch: Partial<GeneratedTable>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addTable = (seats = 2) => {
    onChange([...value, { number: nextTableNumber(value), seats }]);
  };

  if (isEmpty) {
    return (
      <div className={`table-layout-editor is-empty${compact ? " is-compact" : ""}`}>
        <div className="table-layout-empty-state">
          <span className="table-layout-empty-icon" aria-hidden>
            <LayoutGrid size={22} strokeWidth={2} />
          </span>
          <p className="table-layout-empty-title">No tables yet</p>
          <p className="table-layout-empty">
            Add tables for this branch. Numbers are assigned automatically.
          </p>
          <button
            type="button"
            className="cta-btn merchant-cta-accent table-layout-empty-cta"
            onClick={() => addTable(2)}
          >
            <Plus size={16} strokeWidth={2.6} />
            Add table
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`table-layout-editor${compact ? " is-compact" : ""}`}>
      <div className="table-layout-cols" aria-hidden="true">
        <span>Number</span>
        <span>Seats</span>
        <span />
      </div>

      <ul className="table-layout-rows">
        {value.map((row, index) => {
          const seatsOptions = SIZE_OPTIONS.includes(row.seats)
            ? SIZE_OPTIONS
            : [...SIZE_OPTIONS, row.seats].sort((a, b) => a - b);
          return (
            <li key={`${idPrefix}-${index}`} className="table-layout-row">
              <label className="table-layout-number">
                <span className="sr-only">Table number</span>
                <input
                  type="number"
                  className="table-layout-number-input"
                  min={1}
                  max={999}
                  value={row.number}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    updateRow(index, {
                      number: Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1,
                    });
                  }}
                />
              </label>

              <label className="table-layout-size">
                <span className="sr-only">Seats</span>
                <select
                  className="table-layout-select"
                  value={row.seats}
                  onChange={(e) =>
                    updateRow(index, { seats: Number(e.target.value) })
                  }
                >
                  {seatsOptions.map((seats) => (
                    <option key={seats} value={seats}>
                      {seats} seats
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="table-layout-remove"
                onClick={() => removeRow(index)}
                aria-label={`Remove table ${row.number}`}
              >
                <Trash2 size={15} strokeWidth={2.2} />
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" className="table-layout-add" onClick={() => addTable(2)}>
        <Plus size={14} strokeWidth={2.6} />
        Add table
      </button>

      <p className="table-layout-preview">
        <strong>{value.length}</strong> table{value.length === 1 ? "" : "s"} ·
        numbers are editable
      </p>
    </div>
  );
}
