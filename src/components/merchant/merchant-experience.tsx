"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { toast } from "sonner";
import type { Branch, MemberRole, MerchantCustomer, MerchantEditSection, MerchantMember, MerchantProduct, MerchantProfile, MerchantTab, PendingApproval, DashboardFilteredStats } from "@/lib/merchant/types";
import {
  ALL_TABS,
  OWNER_WORKSPACE_TABS,
  PRODUCT_DEFAULT_TAB,
  TAB_HREF,
  TAB_LABELS,
  productForPathname,
  productForTab,
  tabForPathname,
} from "@/lib/merchant/nav";
import {
  approveStamp,
  confirmOfferStamp,
  createBranch,
  deleteBranch,
  deleteCustomer,
  deleteMerchantAccount,
  inviteMember,
  redeemRewardByCode,
  rejectStamp,
  removeMember,
  requestOfferStampOtp,
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
import { MerchantWorkspaceProvider, type MerchantWorkspaceValue } from "./merchant-workspace-context";
import { BranchSwitcher } from "./branch-switcher";
import {
  hasUsedTrial,
  isProductEnabled,
  isTrialActive,
  isTrialExpired,
  productNeedsOnboarding,
  type Entitlements,
} from "@/lib/merchant/entitlements";
import { maxBranchesFor } from "@/lib/merchant/plan-limits";
import { MerchantGateSplash } from "./skeletons";
import { ProductLockedGate } from "./product-locked-gate";

function DrawerChunkFallback({ className }: { className?: string }) {
  return (
    <div
      className={`thanks-overlay open${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-modal="true"
      aria-busy="true"
    >
      <div className="thanks-sheet">
        <div className="sheet-handle" />
      </div>
    </div>
  );
}

const MerchantQrDrawer = dynamic(
  () => import("./qr-drawer").then((m) => m.MerchantQrDrawer),
  { ssr: false, loading: () => <DrawerChunkFallback /> },
);

const RedeemDrawer = dynamic(
  () => import("./redeem-drawer").then((m) => m.RedeemDrawer),
  {
    ssr: false,
    loading: () => <DrawerChunkFallback className="merchant-theme merchant-redeem-drawer" />,
  },
);

const ProductPurchaseDrawer = dynamic(
  () => import("./product-purchase-drawer").then((m) => m.ProductPurchaseDrawer),
  {
    ssr: false,
    loading: () => <DrawerChunkFallback className="merchant-theme merchant-edit-drawer" />,
  },
);

const BranchesTeamDrawer = dynamic(
  () => import("./branches-team-drawer").then((m) => m.BranchesTeamDrawer),
  {
    ssr: false,
    loading: () => <DrawerChunkFallback className="merchant-theme merchant-edit-drawer" />,
  },
);

const OnboardingWizard = dynamic(
  () => import("./onboarding/onboarding-wizard").then((m) => m.OnboardingWizard),
  { ssr: false, loading: () => <MerchantGateSplash /> },
);

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
  const [, startNavTransition] = useTransition();

  const pathTab = tabForPathname(pathname);
  /** Optimistic highlight while the soft navigation settles. */
  const [pendingTab, setPendingTab] = useState<MerchantTab | null>(null);
  const activeTab = pendingTab ?? pathTab;

  useEffect(() => {
    if (pendingTab && pathTab === pendingTab) setPendingTab(null);
  }, [pathTab, pendingTab]);

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

  // Warm the App Router cache so tab switches feel instant.
  useEffect(() => {
    for (const tab of ALL_TABS) {
      if (tab === "scan" || tab === "approvals") continue;
      router.prefetch(TAB_HREF[tab]);
    }
  }, [router]);

  // Non-owners can't stay on owner-only workspace hubs (All customers).
  useEffect(() => {
    if (role === "owner") return;
    if (OWNER_WORKSPACE_TABS.includes(activeTab)) {
      router.replace(TAB_HREF[PRODUCT_DEFAULT_TAB[activeProduct]]);
    }
  }, [role, activeTab, activeProduct, router]);

  const [profile, setProfile] = useState<MerchantProfile>(initialProfile);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrProduct, setQrProduct] = useState<MerchantProduct>("loyalty");
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editSection, setEditSection] = useState<MerchantEditSection>(null);
  const [purchaseProductTarget, setPurchaseProductTarget] = useState<MerchantProduct | null>(null);
  const [manageView, setManageView] = useState<"branches" | "team" | null>(null);

  // Latches: mount heavy drawers after first open so cold load skips their
  // chunks, while later close/reopen keeps exit animations + internal state.
  const [qrOpened, setQrOpened] = useState(false);
  const [redeemOpened, setRedeemOpened] = useState(false);
  const [purchaseOpened, setPurchaseOpened] = useState(false);
  const [manageOpened, setManageOpened] = useState(false);

  useEffect(() => setProfile(initialProfile), [initialProfile]);
  useEffect(() => {
    if (qrOpen) setQrOpened(true);
  }, [qrOpen]);
  useEffect(() => {
    if (redeemOpen) setRedeemOpened(true);
  }, [redeemOpen]);
  useEffect(() => {
    if (purchaseProductTarget) setPurchaseOpened(true);
  }, [purchaseProductTarget]);
  useEffect(() => {
    if (manageView) setManageOpened(true);
  }, [manageView]);

  // Navigate to a tab by pushing its route (URL is the source of truth).
  const goToTab = useCallback(
    (tab: MerchantTab) => {
      if (tab === "scan") {
        setRedeemOpen(true);
        return;
      }
      if (OWNER_WORKSPACE_TABS.includes(tab) && role !== "owner") {
        toast.error("Only the owner can open this page.");
        return;
      }
      if (tab === pathTab) {
        setPendingTab(null);
        return;
      }
      const product = productForTab(tab);
      if (product) setActiveProduct(product);
      setPendingTab(tab);
      startNavTransition(() => {
        router.push(TAB_HREF[tab]);
      });
    },
    [router, role, pathTab],
  );

  const openQr = useCallback(
    (product?: MerchantProduct) => {
      const resolved =
        product ?? productForPathname(pathname) ?? activeProduct;
      setQrProduct(resolved);
      setQrOpen(true);
    },
    [pathname, activeProduct],
  );

  // Switch product from the rail and land on that product's default tab.
  const goToProduct = useCallback(
    (product: MerchantProduct) => {
      const tab = PRODUCT_DEFAULT_TAB[product];
      setActiveProduct(product);
      if (tab === pathTab) {
        setPendingTab(null);
        return;
      }
      setPendingTab(tab);
      startNavTransition(() => {
        router.push(TAB_HREF[tab]);
      });
    },
    [router, pathTab],
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
      const resolved = tab === "approvals" ? "dashboard" : tab;
      if (resolved && ALL_TABS.includes(resolved as MerchantTab)) {
        router.push(TAB_HREF[resolved as MerchantTab]);
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

  const handleRequestOfferStampOtp = useCallback(
    (id: string) => requestOfferStampOtp(id),
    [],
  );

  const handleConfirmOfferStamp = useCallback(
    async (id: string, code: string) => {
      const res = await confirmOfferStamp(id, code);
      if (!res.ok) {
        return { ok: false, error: res.error ?? "Could not offer a stamp." };
      }
      toast.success("Stamp offered");
      await onRefresh();
      return { ok: true };
    },
    [onRefresh],
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

  const handleSaveQueueHours = useCallback(
    async (hours: {
      openTime: string;
      closeTime: string;
      openDays: number[];
      autoSessions: boolean;
    }) => {
      const patch = {
        queueOpenTime: hours.openTime,
        queueCloseTime: hours.closeTime,
        queueHoursTimezone: "Asia/Kolkata" as const,
        queueOpenDays: hours.openDays,
        queueAutoStart: hours.autoSessions,
        queueAutoClose: hours.autoSessions,
      };
      setProfile((prev) => ({ ...prev, ...patch }));
      await run(() => updateMerchantProfile(patch), "Store timings saved");
    },
    [run],
  );

  const handleSaveReservationSettings = useCallback(
    async (patch: Partial<MerchantProfile>) => {
      setProfile((prev) => ({ ...prev, ...patch }));
      await run(() => updateMerchantProfile(patch), "Reservation settings saved");
    },
    [run],
  );

  const handleSetReservationPaused = useCallback(
    async (paused: boolean) => {
      setProfile((prev) => ({ ...prev, reservationPaused: paused }));
      const ok = await run(
        () => updateMerchantProfile({ reservationPaused: paused }),
        paused ? "Bookings stopped" : "Bookings open again",
      );
      // The optimistic flip has to come back if the write failed, otherwise the
      // dashboard claims bookings are closed while the form is still live.
      if (!ok) setProfile((prev) => ({ ...prev, reservationPaused: !paused }));
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

  const ownerName = `${profile.ownerFirstName} ${profile.ownerLastName}`.trim();
  const memberName =
    members
      .find((m) => m.email.trim().toLowerCase() === profile.email.trim().toLowerCase())
      ?.name.trim() || "";
  // Owner membership was historically seeded with the business name — skip that.
  const memberLooksLikePerson =
    memberName.length > 0 &&
    memberName.toLowerCase() !== profile.businessName.trim().toLowerCase();
  const sidebarUserName =
    role === "owner"
      ? ownerName || (memberLooksLikePerson ? memberName : "") || profile.email
      : (memberLooksLikePerson ? memberName : "") || ownerName || profile.email;

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
      onShowQr: openQr,
      onRedeemCode: () => setRedeemOpen(true),
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
      onRefresh,
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
      onRequestOfferStampOtp: handleRequestOfferStampOtp,
      onConfirmOfferStamp: handleConfirmOfferStamp,
      onEditSection: setEditSection,
      onSaveQueueBanner: handleSaveQueueBanner,
      onSaveQueueHours: handleSaveQueueHours,
      onSaveReservationSettings: handleSaveReservationSettings,
      onSetReservationPaused: handleSetReservationPaused,
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
      openQr,
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
      handleRequestOfferStampOtp,
      handleConfirmOfferStamp,
      handleSaveQueueBanner,
      handleSaveQueueHours,
      handleSaveReservationSettings,
      handleSetReservationPaused,
      onRefresh,
      onLogout,
    ],
  );

  // Product paywall: the product's own screens are replaced by a pitch card over
  // a blurred page. The plan pages stay reachable — that's where the CTA lands.
  const lockedProduct =
    productFromPath &&
    !isProductEnabled(entitlements, productFromPath) &&
    !pathname.endsWith("/plan")
      ? productFromPath
      : null;

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
        isOwner={role === "owner"}
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
        userName={sidebarUserName}
        userRole={role}
        onTabChange={goToTab}
        onGetStarted={(product) => {
          if (role !== "owner") {
            toast.error("Only the owner can add or manage products.");
            return;
          }
          setPurchaseProductTarget(product);
        }}
        onOpenAccount={() => setEditSection("account")}
        pendingCount={approvals.length}
      />

      <div className="merchant-main">
        <OnboardingPrompt />
        <header className="merchant-header">
          <div className="merchant-header-brand">
            <div className="merchant-header-logo">
              <Image src={FROQ_LOGO_SRC} alt="Froq" width={34} height={34} priority />
            </div>
          </div>
          <div className="merchant-header-title">
            <h1 className="merchant-header-title-name">
              {pathname.endsWith("/plan") ? "Manage plan" : TAB_LABELS[activeTab]}
            </h1>
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
            {lockedProduct ? (
              <ProductLockedGate
                product={lockedProduct}
                tab={activeTab}
                canPurchase={role === "owner"}
                canStartTrial={
                  (lockedProduct === "queue" || lockedProduct === "reservation") &&
                  !hasUsedTrial(entitlements[lockedProduct])
                }
                trialExpired={isTrialExpired(entitlements[lockedProduct])}
                onTrialStarted={onRefresh}
              />
            ) : (
              children
            )}
          </MerchantWorkspaceProvider>
        </main>
      </div>

      <MerchantNav
        activeProduct={activeProduct}
        activeTab={activeTab}
        onTabChange={goToTab}
        onProductChange={goToProduct}
        onScan={() => setRedeemOpen(true)}
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
        activeProduct={activeProduct}
        role={role}
        entitlements={entitlements}
        canPurchase={role === "owner"}
        userName={sidebarUserName}
        onTabChange={goToTab}
        onProductChange={goToProduct}
        onUpgrade={(product) => {
          if (role !== "owner") {
            toast.error("Only the owner can upgrade plans.");
            return;
          }
          setPurchaseProductTarget(product);
        }}
        onOpenAccount={() => setEditSection("account")}
        onLogout={onLogout}
        onClose={() => setMenuOpen(false)}
      />

      {qrOpened && (
        <MerchantQrDrawer
          open={qrOpen}
          profile={profile}
          product={qrProduct}
          enabled={isProductEnabled(entitlements, qrProduct)}
          branchSlug={activeBranch && !activeBranch.isDefault ? activeBranch.slug : null}
          branchName={activeBranch && !activeBranch.isDefault ? activeBranch.name : null}
          onClose={() => setQrOpen(false)}
        />
      )}

      {redeemOpened && (
        <RedeemDrawer
          open={redeemOpen}
          onClose={() => setRedeemOpen(false)}
          onRedeem={handleRedeem}
        />
      )}

      {purchaseOpened && (
        <ProductPurchaseDrawer
          product={purchaseProductTarget}
          onClose={() => setPurchaseProductTarget(null)}
          onPurchased={handlePurchased}
        />
      )}

      {manageOpened && (
        <BranchesTeamDrawer
          view={manageView}
          branches={branches}
          members={members}
          role={role}
          maxBranches={maxBranchesFor({
            loyaltyPlanId: entitlements.loyalty?.planId,
            queuePlanId: entitlements.queue?.planId,
            queueEnabled: isProductEnabled(entitlements, "queue"),
            queueTrialActive: isTrialActive(entitlements.queue),
          })}
          onCreateBranch={onCreateBranch}
          onUpdateBranch={onUpdateBranch}
          onDeleteBranch={onDeleteBranch}
          onInviteMember={onInviteMember}
          onUpdateMemberRole={onUpdateMemberRole}
          onRemoveMember={onRemoveMember}
          onClose={() => setManageView(null)}
        />
      )}

      <MerchantNotificationsDrawer
        open={notifOpen}
        product={activeProduct}
        approvals={approvals}
        onViewApprovals={() => goToTab("dashboard")}
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
