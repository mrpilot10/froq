"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { toast } from "sonner";
import type { Branch, MemberRole, MerchantCustomer, MerchantEditSection, MerchantMember, MerchantProduct, MerchantProfile, MerchantTab, PendingApproval, DashboardFilteredStats } from "@/lib/merchant/types";
import {
  ALL_TABS,
  PRODUCT_DEFAULT_TAB,
  TAB_HREF,
  TAB_LABELS,
  productForPathname,
  tabForPathname,
} from "@/lib/merchant/nav";
import {
  approveStamp,
  createBranch,
  deleteBranch,
  deleteCustomer,
  deleteMerchantAccount,
  inviteMember,
  offerStamp,
  redeemRewardByCode,
  rejectStamp,
  removeMember,
  setCustomerBanned,
  updateBranch,
  updateMemberRole,
  updateMerchantProfile,
} from "@/app/merchant/actions";
import { DeleteAccountDrawer } from "@/components/shared/delete-account-drawer";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { enablePushForMerchant, registerServiceWorker } from "@/lib/push/client";
import { MerchantNav } from "./merchant-nav";
import { MerchantSidebar } from "./merchant-sidebar";
import { MerchantMobileMenu } from "./merchant-mobile-menu";
import { MerchantNotificationsDrawer } from "./notifications-drawer";
import { OnboardingPrompt } from "./onboarding-prompt";
import { ProductRail } from "./product-rail";
import { MerchantProfileEditScreen } from "./profile-edit-screen";
import { MerchantQrDrawer } from "./qr-drawer";
import { MerchantWorkspaceProvider, type MerchantWorkspaceValue } from "./merchant-workspace-context";
import { BranchSwitcher } from "./branch-switcher";
import { BranchesTeamDrawer } from "./branches-team-drawer";
import { OnboardingWizard } from "./onboarding/onboarding-wizard";
import { ProductPurchaseDrawer } from "./product-purchase-drawer";
import {
  isProductEnabled,
  productNeedsOnboarding,
  type Entitlements,
} from "@/lib/merchant/entitlements";

interface MerchantWorkspaceProps {
  profile: MerchantProfile;
  dashboardStats: DashboardFilteredStats;
  customers: MerchantCustomer[];
  approvals: PendingApproval[];
  entitlements: Entitlements;
  branches: Branch[];
  members: MerchantMember[];
  role: MemberRole;
  activeBranchId: string | null;
  canViewAllBranches?: boolean;
  justJoined?: boolean;
  onSelectBranch: (branchId: string | null) => void | Promise<void>;
  onRefresh: () => Promise<void>;
  onLogout?: () => void;
  children: ReactNode;
}

export function MerchantExperience({
  profile: initialProfile,
  dashboardStats,
  customers,
  approvals,
  entitlements,
  branches,
  members,
  role,
  activeBranchId,
  canViewAllBranches = true,
  justJoined = false,
  onSelectBranch,
  onRefresh,
  onLogout,
  children,
}: MerchantWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname() ?? TAB_HREF.dashboard;

  const activeTab = tabForPathname(pathname);
  // Shared pages (customers / business settings) keep whichever product the
  // merchant last viewed, so the rail + sidebar context doesn't jump around.
  const productFromPath = productForPathname(pathname);
  const [activeProduct, setActiveProduct] = useState<MerchantProduct>(
    productFromPath ?? "loyalty",
  );
  useEffect(() => {
    if (productFromPath && productFromPath !== activeProduct) {
      setActiveProduct(productFromPath);
    }
  }, [productFromPath, activeProduct]);

  const [profile, setProfile] = useState<MerchantProfile>(initialProfile);
  const [qrOpen, setQrOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editSection, setEditSection] = useState<MerchantEditSection>(null);
  const [purchaseProductTarget, setPurchaseProductTarget] = useState<MerchantProduct | null>(null);
  const [manageView, setManageView] = useState<"branches" | "team" | null>(null);

  useEffect(() => setProfile(initialProfile), [initialProfile]);

  // Navigate to a tab by pushing its route (URL is the source of truth).
  const goToTab = useCallback(
    (tab: MerchantTab) => {
      router.push(TAB_HREF[tab]);
    },
    [router],
  );

  // Switch product from the rail and land on that product's default tab.
  const goToProduct = useCallback(
    (product: MerchantProduct) => {
      setActiveProduct(product);
      router.push(TAB_HREF[PRODUCT_DEFAULT_TAB[product]]);
    },
    [router],
  );

  // After a successful in-dashboard purchase: refresh entitlements and route to
  // the new product (its onboarding gate will take over automatically).
  const handlePurchased = useCallback(
    async (product: MerchantProduct) => {
      setPurchaseProductTarget(null);
      await onRefresh();
      setActiveProduct(product);
      router.push(TAB_HREF[PRODUCT_DEFAULT_TAB[product]]);
    },
    [onRefresh, router],
  );

  // Open the tab from a push-notification deep link (?tab=approvals&product=queue).
  useEffect(() => {
    const openTabFromUrl = (url?: string) => {
      const search = url
        ? new URL(url, window.location.origin).search
        : window.location.search;
      const params = new URLSearchParams(search);
      const tab = params.get("tab");
      if (tab && ALL_TABS.includes(tab as MerchantTab)) {
        router.push(TAB_HREF[tab as MerchantTab]);
      }
    };

    openTabFromUrl();

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "froq:navigate") return;
      openTabFromUrl(event.data.url as string | undefined);
    };

    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [router]);

  // Jump to the top (no animation) on navigation so each page starts at its header.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Register the service worker and (re)subscribe to push if already allowed,
  // so approval alerts arrive even when the dashboard isn't focused.
  useEffect(() => {
    const syncPush = () => {
      void registerServiceWorker();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        void enablePushForMerchant();
      }
    };

    syncPush();
    window.addEventListener("focus", syncPush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncPush();
    });
    return () => {
      window.removeEventListener("focus", syncPush);
    };
  }, []);

  // Live dashboard: refetch when stamp requests or redemptions change.
  const merchantFilter = profile.id ? `merchant_id=eq.${profile.id}` : undefined;
  const refreshFn = useCallback(() => {
    void onRefresh();
  }, [onRefresh]);
  useRealtime("approvals", merchantFilter, refreshFn);
  useRealtime("redemptions", merchantFilter, refreshFn);

  // Welcome an invited teammate the first time they land on the dashboard.
  const welcomedRef = useRef(false);
  useEffect(() => {
    if (justJoined && !welcomedRef.current) {
      welcomedRef.current = true;
      toast.success(`Welcome to ${initialProfile.businessName}! You've joined the team.`);
    }
  }, [justJoined, initialProfile.businessName]);

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
    (id: string) => run(() => approveStamp(id), "Stamp approved"),
    [run],
  );

  const handleDisapprove = useCallback(
    (id: string) => run(() => rejectStamp(id)),
    [run],
  );

  const handleRedeem = useCallback(
    async (code: string) => {
      const res = await redeemRewardByCode(code);
      if (res.ok) await onRefresh();
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

  const handleOfferStamp = useCallback(
    (id: string) => run(() => offerStamp(id), "Stamp offered"),
    [run],
  );

  const handleSaveProfile = useCallback(async () => {
    const ok = await run(() => updateMerchantProfile(profile), "Changes saved");
    if (ok) setEditSection(null);
  }, [run, profile]);

  const handleSaveQueueBanner = useCallback(
    async (queueBanner: string, queueBannerLink: string) => {
      setProfile((prev) => ({ ...prev, queueBanner, queueBannerLink }));
      await run(
        () => updateMerchantProfile({ queueBanner, queueBannerLink }),
        "Banner updated",
      );
    },
    [run],
  );

  const onCreateBranch = useCallback(
    async (input: { name: string; address?: string }): Promise<string | null> => {
      const res = await createBranch(input);
      if (!res.ok) {
        toast.error(res.error ?? "Could not add branch");
        return null;
      }
      toast.success("Branch added");
      await onRefresh();
      return res.branchId ?? null;
    },
    [onRefresh],
  );
  const onUpdateBranch = useCallback(
    (id: string, patch: { name?: string; address?: string }) =>
      run(() => updateBranch(id, patch), "Branch updated"),
    [run],
  );
  const onDeleteBranch = useCallback(
    (id: string) => run(() => deleteBranch(id), "Branch removed"),
    [run],
  );
  const onInviteMember = useCallback(
    async (input: {
      email: string;
      name?: string;
      role: MemberRole;
      branchIds?: string[];
    }): Promise<boolean> => {
      const res = await inviteMember(input);
      if (!res.ok) {
        toast.error(res.error ?? "Could not send invite");
        return false;
      }
      if (res.emailSent) {
        toast.success(`Invitation sent to ${input.email}`);
      } else {
        toast.error(
          `${input.email} was added, but the invite email couldn't be sent${
            res.error ? `: ${res.error}` : "."
          }`,
        );
      }
      await onRefresh();
      return true;
    },
    [onRefresh],
  );
  const onUpdateMemberRole = useCallback(
    (id: string, memberRole: MemberRole, branchIds?: string[]) =>
      run(() => updateMemberRole(id, memberRole, branchIds), "Member updated"),
    [run],
  );
  const onRemoveMember = useCallback(
    (id: string) => run(() => removeMember(id), "Member removed"),
    [run],
  );

  const notifCount = activeProduct === "loyalty" ? approvals.length : 0;
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;

  const workspaceValue = useMemo<MerchantWorkspaceValue>(
    () => ({
      profile,
      dashboardStats,
      customers,
      approvals,
      entitlements,
      branches,
      members,
      role,
      activeBranchId,
      canViewAllBranches,
      avgOrderValue: profile.avgOrderValue,
      goToTab,
      onShowQr: () => setQrOpen(true),
      onSelectBranch,
      onManageBranches: () => setManageView("branches"),
      onManageTeam: () => setManageView("team"),
      onPurchaseProduct: (product: MerchantProduct) => {
        if (role !== "owner") {
          toast.error("Only the owner can add or manage products.");
          return;
        }
        setPurchaseProductTarget(product);
      },
      onCreateBranch,
      onUpdateBranch,
      onDeleteBranch,
      onInviteMember,
      onUpdateMemberRole,
      onRemoveMember,
      onApprove: handleApprove,
      onDisapprove: handleDisapprove,
      onRedeem: handleRedeem,
      onBanCustomer: handleBanCustomer,
      onDeleteCustomer: handleDeleteCustomer,
      onOfferStamp: handleOfferStamp,
      onEditSection: setEditSection,
      onSaveQueueBanner: handleSaveQueueBanner,
      onDeleteAccount: () => setDeleteOpen(true),
      onLogout,
    }),
    [
      profile,
      dashboardStats,
      customers,
      approvals,
      entitlements,
      branches,
      members,
      role,
      activeBranchId,
      canViewAllBranches,
      onSelectBranch,
      goToTab,
      onCreateBranch,
      onUpdateBranch,
      onDeleteBranch,
      onInviteMember,
      onUpdateMemberRole,
      onRemoveMember,
      handleApprove,
      handleDisapprove,
      handleRedeem,
      handleBanCustomer,
      handleDeleteCustomer,
      handleOfferStamp,
      handleSaveQueueBanner,
      onLogout,
    ],
  );

  // Per-product onboarding gate: a purchased product whose setup isn't finished
  // takes over the screen (full-screen wizard) until completed.
  if (productFromPath && productNeedsOnboarding(entitlements, productFromPath)) {
    return (
      <OnboardingWizard
        mode="product"
        product={productFromPath}
        onComplete={onRefresh}
      />
    );
  }

  return (
    <div className="merchant-page merchant-page--app merchant-theme">
      <ProductRail
        activeProduct={activeProduct}
        activeTab={activeTab}
        onProductChange={goToProduct}
        onTabChange={goToTab}
        pendingCount={approvals.length}
        onLogout={onLogout}
      />

      <MerchantSidebar
        activeProduct={activeProduct}
        activeTab={activeTab}
        entitlements={entitlements}
        canPurchase={role === "owner"}
        onTabChange={goToTab}
        onGetStarted={(product) => {
          if (role !== "owner") {
            toast.error("Only the owner can add or manage products.");
            return;
          }
          setPurchaseProductTarget(product);
        }}
        pendingCount={approvals.length}
        onLogout={onLogout}
      />

      <div className="merchant-main">
        <OnboardingPrompt />
        <header className="merchant-header">
          <div className="merchant-header-brand">
            <div className="merchant-header-logo">
              <Image src="/froq-logo.png" alt="Froq" width={34} height={34} priority />
            </div>
          </div>
          <div className="merchant-header-title">
            <h1 className="merchant-header-title-name">{TAB_LABELS[activeTab]}</h1>
            <BranchSwitcher
              branches={branches}
              activeBranch={activeBranch}
              canManage={role === "owner"}
              allowAllBranches={canViewAllBranches}
              onSelect={onSelectBranch}
              onAddBranch={() => setManageView("branches")}
            />
          </div>
          <div className="merchant-header-actions">
            <button
              type="button"
              className="merchant-icon-btn merchant-notif-btn"
              aria-label="Notifications"
              onClick={() => setNotifOpen(true)}
            >
              <Bell size={18} strokeWidth={2.2} />
              {notifCount > 0 && (
                <span className="merchant-notif-badge" aria-label={`${notifCount} new`}>
                  {notifCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className="merchant-hamburger"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        <main className="merchant-content">
          <MerchantWorkspaceProvider value={workspaceValue}>
            {children}
          </MerchantWorkspaceProvider>
        </main>
      </div>

      <MerchantNav
        activeProduct={activeProduct}
        activeTab={activeTab}
        onTabChange={goToTab}
        onProductChange={goToProduct}
        pendingCount={approvals.length}
      />

      <MerchantProfileEditScreen
        section={editSection}
        profile={profile}
        onChange={setProfile}
        onClose={() => setEditSection(null)}
        onSave={handleSaveProfile}
      />

      <MerchantMobileMenu
        open={menuOpen}
        activeTab={activeTab}
        onTabChange={goToTab}
        onLogout={onLogout}
        onClose={() => setMenuOpen(false)}
      />

      <MerchantQrDrawer
        open={qrOpen}
        profile={profile}
        product={activeProduct}
        enabled={isProductEnabled(entitlements, activeProduct)}
        branchSlug={activeBranch && !activeBranch.isDefault ? activeBranch.slug : null}
        branchName={activeBranch && !activeBranch.isDefault ? activeBranch.name : null}
        onClose={() => setQrOpen(false)}
      />

      <ProductPurchaseDrawer
        product={purchaseProductTarget}
        onClose={() => setPurchaseProductTarget(null)}
        onPurchased={handlePurchased}
      />

      <BranchesTeamDrawer
        view={manageView}
        branches={branches}
        members={members}
        role={role}
        onCreateBranch={onCreateBranch}
        onUpdateBranch={onUpdateBranch}
        onDeleteBranch={onDeleteBranch}
        onInviteMember={onInviteMember}
        onUpdateMemberRole={onUpdateMemberRole}
        onRemoveMember={onRemoveMember}
        onClose={() => setManageView(null)}
      />

      <MerchantNotificationsDrawer
        open={notifOpen}
        product={activeProduct}
        approvals={approvals}
        onViewApprovals={() => goToTab("approvals")}
        onClose={() => setNotifOpen(false)}
      />

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
