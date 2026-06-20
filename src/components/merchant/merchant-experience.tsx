"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { LifeBuoy, QrCode } from "lucide-react";
import { toast } from "sonner";
import type { MerchantCustomer, MerchantEditSection, MerchantProfile, MerchantTab, PendingApproval } from "@/lib/merchant/types";
import {
  approveStamp,
  deleteCustomer,
  deleteMerchantAccount,
  redeemRewardByCode,
  rejectStamp,
  setCustomerBanned,
  updateMerchantProfile,
  type MerchantStatsData,
} from "@/app/merchant/actions";
import { DeleteAccountDrawer } from "@/components/shared/delete-account-drawer";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { enablePushForMerchant, registerServiceWorker } from "@/lib/push/client";
import { ApprovalsScreen } from "./approvals-screen";
import { CustomersScreen } from "./customers-screen";
import { DashboardScreen } from "./dashboard-screen";
import { MerchantNav } from "./merchant-nav";
import { OnboardingPrompt } from "./onboarding-prompt";
import { MerchantProfileEditScreen } from "./profile-edit-screen";
import { MerchantProfileScreen } from "./profile-screen";
import { MerchantQrDrawer } from "./qr-drawer";
import { ScannerScreen } from "./scanner-screen";

interface MerchantExperienceProps {
  profile: MerchantProfile;
  stats: MerchantStatsData;
  customers: MerchantCustomer[];
  approvals: PendingApproval[];
  onRefresh: () => Promise<void>;
  onLogout?: () => void;
}

export function MerchantExperience({
  profile: initialProfile,
  stats,
  customers,
  approvals,
  onRefresh,
  onLogout,
}: MerchantExperienceProps) {
  const [activeTab, setActiveTab] = useState<MerchantTab>("dashboard");
  const [editSection, setEditSection] = useState<MerchantEditSection>(null);
  const [profile, setProfile] = useState<MerchantProfile>(initialProfile);
  const [qrOpen, setQrOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => setProfile(initialProfile), [initialProfile]);

  // Register the service worker and (re)subscribe to push if already allowed,
  // so approval alerts arrive even when the dashboard isn't focused.
  useEffect(() => {
    void registerServiceWorker();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      void enablePushForMerchant();
    }
  }, []);

  // Live dashboard: refetch when stamp requests or redemptions change.
  const merchantFilter = profile.id ? `merchant_id=eq.${profile.id}` : undefined;
  const refreshFn = useCallback(() => {
    void onRefresh();
  }, [onRefresh]);
  useRealtime("approvals", merchantFilter, refreshFn);
  useRealtime("redemptions", merchantFilter, refreshFn);

  // In-app cue when the pending queue grows while the dashboard is open.
  const [prevPending, setPrevPending] = useState(approvals.length);
  useEffect(() => {
    if (approvals.length > prevPending) {
      toast("New stamp request awaiting approval");
    }
    setPrevPending(approvals.length);
  }, [approvals.length, prevPending]);

  // Runs a server action then refreshes the bundle, surfacing errors as toasts.
  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>, successMsg?: string) => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong");
        return false;
      }
      if (successMsg) toast.success(successMsg);
      await onRefresh();
      return true;
    },
    [onRefresh],
  );

  const handleApprove = useCallback(
    (id: string) => startTransition(() => void run(() => approveStamp(id), "Stamp approved")),
    [run],
  );

  const handleDisapprove = useCallback(
    (id: string) => startTransition(() => void run(() => rejectStamp(id))),
    [run],
  );

  const handleRedeem = useCallback(
    async (code: string) => {
      const res = await redeemRewardByCode(code);
      if (res.ok) {
        toast.success(`Reward redeemed for ${res.customerName ?? "customer"}`);
        await onRefresh();
      }
      return res;
    },
    [onRefresh],
  );

  const handleBanCustomer = useCallback(
    (id: string) => {
      const target = customers.find((c) => c.id === id);
      void run(() => setCustomerBanned(id, !target?.banned), target?.banned ? "Customer unbanned" : "Customer banned");
    },
    [run, customers],
  );

  const handleDeleteCustomer = useCallback(
    (id: string) => void run(() => deleteCustomer(id), "Customer removed"),
    [run],
  );

  const handleSaveProfile = useCallback(async () => {
    const ok = await run(() => updateMerchantProfile(profile), "Changes saved");
    if (ok) {
      setEditSection(null);
      setActiveTab("profile");
    }
  }, [run, profile]);

  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen">
        <OnboardingPrompt />
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
            businessName={profile.businessName}
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
        {activeTab === "scan" && <ScannerScreen onRedeem={handleRedeem} />}
        {activeTab === "profile" && (
          <MerchantProfileScreen
            profile={profile}
            onEditSection={setEditSection}
            onLogout={onLogout}
            onDeleteAccount={() => setDeleteOpen(true)}
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

      <DeleteAccountDrawer
        open={deleteOpen}
        accountName={profile.businessName}
        description="This permanently deletes your store, customers, loyalty data, and QR code. This cannot be undone."
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          const res = await deleteMerchantAccount();
          if (res.ok) {
            toast.success("Account deleted");
            onLogout?.();
          }
          return res;
        }}
      />
    </div>
  );
}
