"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Users } from "lucide-react";
import type { MerchantCustomer } from "@/lib/merchant/types";
import { customerLtv, formatCurrency } from "@/lib/merchant/ltv";
import { CustomerDrawer } from "./customer-drawer";

type SortKey = "ltv" | "visits" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  ltv: "Lifetime value",
  visits: "Visits",
  name: "Name (A–Z)",
};

interface CustomersScreenProps {
  customers: MerchantCustomer[];
  avgOrderValue: number;
  onBanCustomer: (id: string) => void;
  onDeleteCustomer: (id: string) => void;
}

function statusLabel(status: MerchantCustomer["status"]) {
  if (status === "reward_ready") return "Reward ready";
  if (status === "claimed") return "Claimed";
  return "Active";
}

function badgeFor(customer: MerchantCustomer) {
  if (customer.banned) return { label: "Banned", className: "merchant-badge--banned" };
  return {
    label: statusLabel(customer.status),
    className: `merchant-badge--${customer.status}`,
  };
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function exportCsv(customers: MerchantCustomer[], avgOrderValue: number) {
  const headers = [
    "Name",
    "Phone",
    "Email",
    "Stamps",
    "Lifetime visits",
    "LTV (INR)",
    "Status",
    "Member since",
  ];
  const rows = customers.map((c) => [
    c.name,
    c.phone,
    c.email ?? "",
    `${c.stamps}/${c.totalStamps}`,
    c.lifetimeVisits,
    customerLtv(c, avgOrderValue),
    statusLabel(c.status),
    c.memberSince,
  ]);
  const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "froq-customers.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function CustomersScreen({
  customers,
  avgOrderValue,
  onBanCustomer,
  onDeleteCustomer,
}: CustomersScreenProps) {
  const [sortKey, setSortKey] = useState<SortKey>("ltv");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const sorted = useMemo(() => {
    const list = [...customers];
    if (sortKey === "name") return list.sort((a, b) => a.name.localeCompare(b.name));
    if (sortKey === "visits") return list.sort((a, b) => b.lifetimeVisits - a.lifetimeVisits);
    return list.sort((a, b) => customerLtv(b, avgOrderValue) - customerLtv(a, avgOrderValue));
  }, [customers, sortKey, avgOrderValue]);

  if (customers.length === 0) {
    return (
      <div className="tab-screen">
        <div className="tab-head">
          <h2 className="tab-title">Customers</h2>
          <p className="tab-sub">No loyalty members yet</p>
        </div>

        <div className="panel-card merchant-empty">
          <div className="merchant-empty-icon" aria-hidden="true">
            <Users size={26} strokeWidth={2} />
          </div>
          <p className="merchant-empty-title">No customers yet</p>
          <p className="merchant-empty-sub">
            Share your loyalty QR so customers can join. They&apos;ll appear here as soon as they
            sign up and start collecting stamps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Customers</h2>
        <p className="tab-sub">{customers.length} loyalty members</p>
      </div>

      <div className="merchant-toolbar">
        <label className="merchant-sort">
          <span className="merchant-sort-label">Sort</span>
          <select
            className="merchant-select"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            aria-label="Sort customers"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <ChevronDown size={14} strokeWidth={2.4} className="merchant-sort-chevron" aria-hidden />
        </label>

        <button
          type="button"
          className="merchant-export-btn"
          onClick={() => exportCsv(sorted, avgOrderValue)}
        >
          <Download size={14} strokeWidth={2.3} />
          Export
        </button>
      </div>

      <div className="panel-card merchant-list-panel">
        <ul className="merchant-list">
          {sorted.map((customer) => {
            const badge = badgeFor(customer);
            return (
              <li key={customer.id} className="merchant-list-item">
                <button
                  type="button"
                  className={`merchant-list-btn${customer.banned ? " is-banned" : ""}`}
                  onClick={() => setSelectedId(customer.id)}
                >
                  <div className="merchant-avatar">{getInitials(customer.name)}</div>
                  <div className="merchant-list-copy">
                    <div className="merchant-list-title">{customer.name}</div>
                    <div className="merchant-list-sub">
                      {customer.lifetimeVisits} visits · {customer.stamps}/{customer.totalStamps}{" "}
                      stamps
                    </div>
                  </div>
                  <div className="merchant-list-trailing">
                    <span className="merchant-ltv-amount">
                      {formatCurrency(customerLtv(customer, avgOrderValue))}
                    </span>
                    <span className={`merchant-badge ${badge.className}`}>{badge.label}</span>
                  </div>
                  <ChevronRight
                    size={16}
                    strokeWidth={2.2}
                    className="merchant-list-arrow"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <CustomerDrawer
        customer={selected}
        avgOrderValue={avgOrderValue}
        onClose={() => setSelectedId(null)}
        onBan={onBanCustomer}
        onDelete={(id) => {
          onDeleteCustomer(id);
          setSelectedId(null);
        }}
      />
    </div>
  );
}
