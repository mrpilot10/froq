"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Search, Users, X } from "lucide-react";
import type { MemberRole, MerchantCustomer } from "@/lib/merchant/types";
import { customerLtv, formatCurrency } from "@/lib/merchant/ltv";
import { canViewCustomerData } from "@/lib/merchant/roles";
import { CustomerDrawer } from "./customer-drawer";
import type { RequestOfferStampOtpResult } from "./offer-stamp-otp";

type SortKey = "ltv" | "visits" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  ltv: "Lifetime value",
  visits: "Visits",
  name: "Name (A–Z)",
};

interface CustomersScreenProps {
  customers: MerchantCustomer[];
  avgOrderValue: number;
  role: MemberRole;
  onBanCustomer: (id: string) => void;
  onDeleteCustomer: (id: string) => void;
  onRequestOfferStampOtp: (customerId: string) => Promise<RequestOfferStampOtpResult>;
  onConfirmOfferStamp: (
    customerId: string,
    code: string,
  ) => Promise<{ ok: boolean; error?: string }>;
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

function exportCsv(
  customers: MerchantCustomer[],
  avgOrderValue: number,
  includeContact: boolean,
) {
  const headers = includeContact
    ? [
        "Name",
        "Phone",
        "Email",
        "Stamps",
        "Lifetime visits",
        "LTV (INR)",
        "Status",
        "Member since",
      ]
    : ["Name", "Stamps", "Lifetime visits", "LTV (INR)", "Status", "Member since"];
  const rows = customers.map((c) =>
    includeContact
      ? [
          c.name,
          c.phone,
          c.email ?? "",
          `${c.stamps}/${c.totalStamps}`,
          c.lifetimeVisits,
          customerLtv(c, avgOrderValue),
          statusLabel(c.status),
          c.memberSince,
        ]
      : [
          c.name,
          `${c.stamps}/${c.totalStamps}`,
          c.lifetimeVisits,
          customerLtv(c, avgOrderValue),
          statusLabel(c.status),
          c.memberSince,
        ],
  );
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
  role,
  onBanCustomer,
  onDeleteCustomer,
  onRequestOfferStampOtp,
  onConfirmOfferStamp,
}: CustomersScreenProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ltv");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const showData = canViewCustomerData(role);
  const effectiveSort = showData ? sortKey : "name";

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;

    const digits = q.replace(/\D/g, "");
    return customers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (!showData) return false;
      if (digits && c.phone.replace(/\D/g, "").includes(digits)) return true;
      return (c.email ?? "").toLowerCase().includes(q);
    });
  }, [customers, query, showData]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (effectiveSort === "name") return list.sort((a, b) => a.name.localeCompare(b.name));
    if (effectiveSort === "visits") return list.sort((a, b) => b.lifetimeVisits - a.lifetimeVisits);
    return list.sort((a, b) => customerLtv(b, avgOrderValue) - customerLtv(a, avgOrderValue));
  }, [filtered, effectiveSort, avgOrderValue]);

  if (customers.length === 0) {
    return (
      <div className="tab-screen">
        <div className="tab-head">
          <h2 className="tab-title">Loyalty customers</h2>
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

  const searching = query.trim().length > 0;

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Loyalty customers</h2>
        <p className="tab-sub">
          {searching
            ? `${sorted.length} of ${customers.length} members`
            : `${customers.length} members collecting stamps`}
        </p>
      </div>

      <label className="merchant-customer-search-field">
        <Search size={16} strokeWidth={2.2} aria-hidden />
        <input
          type="search"
          className="merchant-customer-search-input"
          placeholder={
            showData ? "Search by name, phone, or email…" : "Search by name…"
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          enterKeyHint="search"
          aria-label="Search loyalty customers"
        />
        {query ? (
          <button
            type="button"
            className="merchant-customer-search-clear"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        ) : null}
      </label>

      <div className="merchant-toolbar">
        {showData ? (
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
        ) : (
          <p className="merchant-field-hint" style={{ margin: 0 }}>
            Select a customer to send a stamp OTP
          </p>
        )}

        {showData ? (
          <button
            type="button"
            className="merchant-export-btn"
            onClick={() => exportCsv(sorted, avgOrderValue, true)}
          >
            <Download size={14} strokeWidth={2.3} />
            Export
          </button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <div className="panel-card merchant-empty merchant-empty--compact">
          <p className="merchant-empty-title">No matches</p>
          <p className="merchant-empty-sub">Try a different name or spelling.</p>
        </div>
      ) : (
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
                      {showData ? (
                        <div className="merchant-list-sub">
                          {customer.lifetimeVisits} visits · {customer.stamps}/{customer.totalStamps}{" "}
                          stamps · {customer.rewardsClaimed} reward
                          {customer.rewardsClaimed === 1 ? "" : "s"} redeemed
                        </div>
                      ) : (
                        <div className="merchant-list-sub">Tap to offer stamp</div>
                      )}
                    </div>
                    {showData ? (
                      <div className="merchant-list-trailing">
                        <span className="merchant-ltv-amount">
                          {formatCurrency(customerLtv(customer, avgOrderValue))}
                        </span>
                        <span className={`merchant-badge ${badge.className}`}>{badge.label}</span>
                      </div>
                    ) : null}
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
      )}

      <CustomerDrawer
        customer={selected}
        avgOrderValue={avgOrderValue}
        role={role}
        onClose={() => setSelectedId(null)}
        onBan={onBanCustomer}
        onDelete={(id) => {
          onDeleteCustomer(id);
          setSelectedId(null);
        }}
        onRequestOfferStampOtp={onRequestOfferStampOtp}
        onConfirmOfferStamp={onConfirmOfferStamp}
      />
    </div>
  );
}
