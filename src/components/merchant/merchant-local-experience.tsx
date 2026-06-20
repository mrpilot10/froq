"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { LifeBuoy, QrCode } from "lucide-react";
import type { MerchantEditSection, MerchantProfile, MerchantTab } from "@/lib/merchant/types";
import { readMerchantSession, writeMerchantSession } from "@/lib/merchant/session";
import {
  clearCheckoutAccount,
  readCheckoutAccount,
} from "@/lib/merchant/checkout";
import {
  writeMerchantAuth,
  writePaymentDone,
  writeSetupDone,
} from "@/lib/merchant/auth";
import { ApprovalsScreen } from "./approvals-screen";
import { CustomersScreen } from "./customers-screen";
import { DashboardScreen } from "./dashboard-screen";
import { MerchantNav } from "./merchant-nav";
import { OnboardingPrompt } from "./onboarding-prompt";
import { MerchantProfileEditScreen } from "./profile-edit-screen";
import { MerchantProfileScreen } from "./profile-screen";
import { MerchantQrDrawer } from "./qr-drawer";
import { ScannerScreen } from "./scanner-screen";
import { MerchantTabSkeleton } from "./skeletons";

interface MerchantLocalExperienceProps {
  onLogout?: () => void;
}

export function MerchantLocalExperience({ onLogout }: MerchantLocalExperienceProps) {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<MerchantTab>("dashboard");
  const [editSection, setEditSection] = useState<MerchantEditSection>(null);
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [customers, setCustomers] = useState(readMerchantSession().customers);
  const [approvals, setApprovals] = useState(readMerchantSession().approvals);
  const [usedCodes, setUsedCodes] = useState<string[]>([]);
  const [stats, setStats] = useState(readMerchantSession().stats);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    const session = readMerchantSession();
    const checkout = readCheckoutAccount();
    setProfile({
      ...session.profile,
      ...(checkout
        ? {
            businessName: checkout.businessName || session.profile.businessName,
            email: checkout.email || session.profile.email,
            phone: checkout.phone || session.profile.phone,
          }
        : {}),
    });
    setCustomers(session.customers);
    setApprovals(session.approvals);
    setUsedCodes(session.usedCodes);
    setStats(session.stats);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !profile) return;
    writeMerchantSession({ profile, customers, approvals, usedCodes, stats });
  }, [ready, profile, customers, approvals, usedCodes, stats]);

  const handleApprove = useCallback((id: string) => {
    setApprovals((prev) => {
      const item = prev.find((a) => a.id === id);
      if (!item) return prev;

      setCustomers((cust) =>
        cust.map((c) => {
          if (c.id !== item.customerId) return c;
          const nextStamps = Math.min(c.stamps + 1, c.totalStamps);
          return {
            ...c,
            stamps: nextStamps,
            lifetimeVisits: c.lifetimeVisits + 1,
            status: nextStamps >= c.totalStamps ? "reward_ready" : c.status,
            lastVisit: "Today",
          };
        }),
      );

      setStats((s) => ({
        ...s,
        stampsToday: s.stampsToday + 1,
        pendingApprovals: Math.max(0, s.pendingApprovals - 1),
      }));

      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleDisapprove = useCallback((id: string) => {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    setStats((s) => ({
      ...s,
      pendingApprovals: Math.max(0, s.pendingApprovals - 1),
    }));
  }, []);

  const handleRedeem = useCallback((code: string, _name: string, customerId: string) => {
    setUsedCodes((prev) => [...prev, code]);
    setCustomers((cust) =>
      cust.map((c) =>
        c.id === customerId ? { ...c, status: "claimed", stamps: 0, lastVisit: "Today" } : c,
      ),
    );
    setStats((s) => ({
      ...s,
      rewardsRedeemed: s.rewardsRedeemed + 1,
      activeCards: Math.max(0, s.activeCards - 1),
    }));
  }, []);

  const handleBanCustomer = useCallback((id: string) => {
    setCustomers((cust) =>
      cust.map((c) => (c.id === id ? { ...c, banned: !c.banned } : c)),
    );
  }, []);

  const handleDeleteCustomer = useCallback((id: string) => {
    setCustomers((cust) => cust.filter((c) => c.id !== id));
    setApprovals((prev) => prev.filter((a) => a.customerId !== id));
  }, []);

  const handleSaveProfile = useCallback(() => {
    setEditSection(null);
    setActiveTab("profile");
  }, []);

  const handleLogout = useCallback(() => {
    writeMerchantAuth(false);
    writePaymentDone(false);
    writeSetupDone(false);
    clearCheckoutAccount();
    onLogout?.();
  }, [onLogout]);

  if (!ready || !profile) {
    return (
      <div className="merchant-page merchant-theme">
        <div className="merchant-screen">
          <MerchantTabSkeleton tab={activeTab} />
        </div>
      </div>
    );
  }

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen">
        <header className="merchant-header">
          <div className="merchant-header-brand">
            <div className="merchant-header-logo">
              <Image src="/froq-logo.png" alt="Froq" width={40} height={40} priority />
            </div>
            <div className="merchant-header-copy">
              <h1 className="merchant-header-name">Froq</h1>
              <p className="merchant-header-sub">{profile.businessName}</p>
            </div>
          </div>
          <div className="merchant-header-actions">
            <button
              type="button"
              className="merchant-icon-btn"
              aria-label="Show loyalty QR code"
              onClick={() => setQrOpen(true)}
            >
              <QrCode size={18} strokeWidth={2.2} />
            </button>
            <button type="button" className="merchant-icon-btn" aria-label="Need help">
              <LifeBuoy size={18} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        {activeTab === "dashboard" && (
          <DashboardScreen
            stats={stats}
            businessName={profile.shortName}
            avgOrderValue={profile.avgOrderValue}
          />
        )}
        {activeTab === "customers" && (
          <CustomersScreen
            customers={customers}
            avgOrderValue={profile.avgOrderValue}
            onBanCustomer={handleBanCustomer}
            onDeleteCustomer={handleDeleteCustomer}
          />
        )}
        {activeTab === "approvals" && (
          <ApprovalsScreen
            approvals={approvals}
            onApprove={handleApprove}
            onDisapprove={handleDisapprove}
          />
        )}
        {activeTab === "scan" && (
          <ScannerScreen usedCodes={usedCodes} onRedeem={handleRedeem} />
        )}
        {activeTab === "profile" && (
          <MerchantProfileScreen
            profile={profile}
            onEditSection={setEditSection}
            onLogout={handleLogout}
          />
        )}
      </div>

      <MerchantNav activeTab={activeTab} onTabChange={setActiveTab} pendingCount={approvals.length} />

      <MerchantProfileEditScreen
        section={editSection}
        profile={profile}
        onChange={setProfile}
        onClose={() => setEditSection(null)}
        onSave={handleSaveProfile}
      />

      <MerchantQrDrawer open={qrOpen} profile={profile} onClose={() => setQrOpen(false)} />

      <OnboardingPrompt />
    </div>
  );
}
