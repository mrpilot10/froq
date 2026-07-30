"use client";

import { useMemo, useState } from "react";
import { Search, Stamp, X } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import type { MemberRole, MerchantCustomer } from "@/lib/merchant/types";
import { canViewCustomerData } from "@/lib/merchant/roles";
import { formatPhoneDisplay } from "@/lib/auth/format";
import { OfferStampOtp, type RequestOfferStampOtpResult } from "./offer-stamp-otp";

interface CustomerStampSearchProps {
  customers: MerchantCustomer[];
  role: MemberRole;
  /** Render search field only (no section chrome) for embedding in another card. */
  embedded?: boolean;
  /** When false, find customers without offering stamps (All Branches). */
  allowStamp?: boolean;
  showBranchBadge?: boolean;
  branchNameById?: Map<string, string>;
  label?: string;
  onRequestOfferStampOtp?: (customerId: string) => Promise<RequestOfferStampOtpResult>;
  onConfirmOfferStamp?: (
    customerId: string,
    code: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function canOfferStamp(customer: MerchantCustomer) {
  return (
    !customer.banned && customer.status !== "reward_ready" && customer.status !== "claimed"
  );
}

export function CustomerStampSearch({
  customers,
  role,
  embedded = false,
  allowStamp = true,
  showBranchBadge = false,
  branchNameById,
  label,
  onRequestOfferStampOtp,
  onConfirmOfferStamp,
}: CustomerStampSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hideContact = !canViewCustomerData(role);

  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const canStampSelected =
    allowStamp &&
    !!selected &&
    canOfferStamp(selected) &&
    !!onRequestOfferStampOtp &&
    !!onConfirmOfferStamp;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];

    return customers
      .filter((c) => {
        const nameHit = c.name.toLowerCase().includes(q);
        if (hideContact) return nameHit;
        const phoneHit = c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, ""));
        const emailHit = (c.email ?? "").toLowerCase().includes(q);
        return nameHit || phoneHit || emailHit;
      })
      .slice(0, 8);
  }, [customers, query, hideContact]);

  const heading = label ?? (allowStamp ? "Add a stamp" : "Find a customer");

  const search = (
    <div className={`merchant-customer-search${embedded ? " merchant-customer-search--embedded" : ""}`}>
      {embedded ? <p className="merchant-home-tools-label">{heading}</p> : null}
      <label className="merchant-customer-search-field">
        <Search size={16} strokeWidth={2.2} aria-hidden />
        <input
          type="search"
          className="merchant-customer-search-input"
          placeholder={
            hideContact ? "Search by name…" : "Search by name, phone, or email…"
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          enterKeyHint="search"
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

      {query.trim() ? (
        matches.length === 0 ? (
          <div className="panel-card merchant-empty merchant-empty--compact merchant-customer-search-empty">
            <p className="merchant-empty-title">No matches</p>
            <p className="merchant-empty-sub">Try a different name or spelling.</p>
          </div>
        ) : (
          <ul className="merchant-customer-search-results">
            {matches.map((customer) => {
              const stampable = allowStamp && canOfferStamp(customer);
              const branchName =
                showBranchBadge && customer.branchId
                  ? (branchNameById?.get(customer.branchId) ?? "Branch")
                  : null;
              const body = (
                <>
                  <div className="merchant-avatar">{getInitials(customer.name)}</div>
                  <div className="merchant-list-copy">
                    <div className="merchant-list-title">{customer.name}</div>
                    {branchName ? (
                      <span className="merchant-branch-badge">{branchName}</span>
                    ) : null}
                    <div className="merchant-list-sub">
                      {customer.stamps}/{customer.totalStamps} stamps
                      {!hideContact
                        ? ` · ${formatPhoneDisplay(customer.phone)}`
                        : null}
                      {customer.banned
                        ? " · Banned"
                        : customer.status === "reward_ready"
                          ? " · Reward ready"
                          : null}
                    </div>
                  </div>
                  {allowStamp ? (
                    stampable ? (
                      <span className="merchant-customer-search-cta">
                        <Stamp size={14} strokeWidth={2.3} />
                        Stamp
                      </span>
                    ) : (
                      <span className="merchant-customer-search-cta is-muted">Unavailable</span>
                    )
                  ) : null}
                </>
              );
              return (
                <li key={customer.id}>
                  {allowStamp ? (
                    <button
                      type="button"
                      className="merchant-customer-search-result"
                      disabled={!stampable}
                      onClick={() => setSelectedId(customer.id)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="merchant-customer-search-result merchant-customer-search-result--static">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );

  return (
    <>
      {embedded ? (
        search
      ) : (
        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">{heading}</h3>
          </div>
          {search}
        </section>
      )}

      {allowStamp ? (
        <BottomSheet
          open={selected !== null && canStampSelected}
          onClose={() => setSelectedId(null)}
          labelledBy="stamp-search-customer-name"
          className="merchant-theme"
        >
          {selected && onRequestOfferStampOtp && onConfirmOfferStamp ? (
            <OfferStampOtp
              customerName={selected.name}
              autoSend
              onRequestCode={() => onRequestOfferStampOtp(selected.id)}
              onConfirm={async (code) => {
                const result = await onConfirmOfferStamp(selected.id, code);
                if (result.ok) setSelectedId(null);
                return result;
              }}
              onCancel={() => setSelectedId(null)}
            />
          ) : null}
        </BottomSheet>
      ) : null}
    </>
  );
}
