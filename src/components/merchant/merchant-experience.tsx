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
import type { Branch, BranchContact, MemberRole, MerchantCustomer, MerchantEditSection, MerchantInAppNotification, MerchantMember, MerchantProduct, MerchantProfile, MerchantTab, PendingApproval, DashboardFilteredStats } from "@/lib/merchant/types";
import {
  ALL_TABS,
  ANALYTICS_WORKSPACE_TABS,
  BUSINESS_SETTINGS_TABS,
  OWNER_WORKSPACE_TABS,
  PRODUCT_DEFAULT_TAB,
  PRODUCTS,
  TAB_HREF,
  TAB_LABELS,
  productForPathname,
  productForTab,
  tabForPathname,
  type ComingSoonProduct,
} from "@/lib/merchant/nav";
import {
  approveStamp,
  confirmOfferStamp,
  createBranch,
  deleteBranch,
  deleteCustomer,
  deleteMerchantAccount,
  inviteMember,
  markInAppNotificationsRead,
  redeemRewardByCode,
  rejectStamp,
  removeMember,
  requestOfferStampOtp,
  setCustomerBanned,
  setProductBranchAssignment,
  updateBranch,
  updateBranchQueueSettings,
  updateCustomerMerchantNotes,
  updateMemberRole,
  updateMerchantProfile,
} from "@/app/merchant/actions";
import { DeleteAccountDrawer } from "@/components/shared/delete-account-drawer";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { enablePushForMerchant, registerServiceWorker } from "@/lib/push/client";
import { joinUrlFor } from "@/components/merchant/use-merchant-qr";
import {
  countQueueTicketsUsedInWindow,
  ensureQueueDataEpoch,
  queueUsageWindowStartMs,
} from "@/lib/merchant/queue-session-storage";
import { countReservationsUsedForPlanMeter } from "@/app/merchant/reservation-actions";
import { countMenuUsedForPlanMeter } from "@/app/merchant/menu-actions";
import { MerchantNav } from "./merchant-nav";
import { MerchantSidebar } from "./merchant-sidebar";
import { MerchantMobileMenu } from "./merchant-mobile-menu";
import { MerchantNotificationsDrawer } from "./notifications-drawer";
import { OnboardingPrompt } from "./onboarding-prompt";
import { ProductRail } from "./product-rail";
import { ComingSoonProductDrawer } from "./coming-soon-product-drawer";
import { AccessDeniedDrawer } from "./access-denied-drawer";
import { MerchantProfileEditScreen } from "./profile-edit-screen";
import { MerchantWorkspaceProvider, type MerchantWorkspaceValue } from "./merchant-workspace-context";
import { BranchSwitcher } from "./branch-switcher";
import {
  isProductEnabled,
  isTrialActive,
  isTrialExpired,
  productNeedsOnboarding,
  type Entitlements,
} from "@/lib/merchant/entitlements";
import {
  activeBranchIdsForProduct,
  type ProductBranchMap,
} from "@/lib/merchant/branch-assignments";
import { memberCanAccessProduct } from "@/lib/merchant/product-access";
import {
  preferredMerchantProduct,
  readRememberedMerchantProduct,
  rememberMerchantProduct,
} from "@/lib/merchant/last-product";
import {
  canAccessBusinessSettingsPage,
  canViewAnalytics,
  canViewBusinessSettings,
} from "@/lib/merchant/roles";
import { planUpgradeSummary } from "@/lib/merchant/plan-summary";
import { isPaidPlanId } from "@/lib/merchant/billing";
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

const HubQrDrawer = dynamic(
  () => import("./hub-qr-drawer").then((m) => m.HubQrDrawer),
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
  inAppNotifications?: MerchantInAppNotification[];
  entitlements: Entitlements;
  branches: Branch[];
  productBranches?: ProductBranchMap;
  members: MerchantMember[];
  role: MemberRole;
  activeBranchId: string | null;
  canViewAllBranches?: boolean;
  /** empty = all products; owners always empty. */
  memberProductIds?: MerchantProduct[];
  justJoined?: boolean;
  currentUserId?: string;
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
  inAppNotifications: initialNotifications = [],
  entitlements,
  branches,
  productBranches = {},
  members,
  role,
  activeBranchId,
  canViewAllBranches = true,
  memberProductIds = [],
  justJoined = false,
  currentUserId = "",
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
  const [activeProduct, setActiveProduct] = useState<MerchantProduct>(() => {
    if (
      productFromPath &&
      memberCanAccessProduct(role, memberProductIds, productFromPath)
    ) {
      return productFromPath;
    }
    return preferredMerchantProduct({
      role,
      memberProductIds,
      lastProduct: readRememberedMerchantProduct(),
      entitlements,
    });
  });
  useEffect(() => {
    if (!productFromPath || productFromPath === activeProduct) return;
    // Don't adopt a product the teammate isn't allowed to open — the silent
    // bounce below sends them to an allowed product home.
    if (!memberCanAccessProduct(role, memberProductIds, productFromPath)) return;
    setActiveProduct(productFromPath);
  }, [productFromPath, activeProduct, role, memberProductIds]);

  // Header switcher only lists branches activated for the current product.
  // When no assignment rows exist yet (pre-migration), fall back to all branches
  // so the dashboard stays usable.
  const productSwitcherBranches = useMemo(() => {
    if (Object.keys(productBranches).length === 0) return branches;
    const ids = new Set(activeBranchIdsForProduct(productBranches, activeProduct));
    return branches.filter((branch) => ids.has(branch.id));
  }, [branches, productBranches, activeProduct]);

  // Warm the App Router cache so tab switches feel instant.
  useEffect(() => {
    for (const tab of ALL_TABS) {
      if (tab === "scan" || tab === "approvals") continue;
      router.prefetch(TAB_HREF[tab]);
    }
  }, [router]);

  const [accessDeniedOpen, setAccessDeniedOpen] = useState(false);

  const goToAllowedProductHome = useCallback(() => {
    const fallback = preferredMerchantProduct({
      role,
      memberProductIds,
      lastProduct: readRememberedMerchantProduct() ?? activeProduct,
      entitlements,
    });
    const tab = PRODUCT_DEFAULT_TAB[fallback];
    const href = TAB_HREF[tab];
    setActiveProduct(fallback);
    rememberMerchantProduct(fallback);
    if (pathname.replace(/\/+$/, "") === href.replace(/\/+$/, "")) {
      setPendingTab(null);
      return;
    }
    setPendingTab(tab);
    router.replace(href);
  }, [role, memberProductIds, entitlements, activeProduct, pathname, router]);

  // Remember the last product the user could open (owners + staff).
  useEffect(() => {
    if (!memberCanAccessProduct(role, memberProductIds, activeProduct)) return;
    rememberMerchantProduct(activeProduct);
  }, [activeProduct, role, memberProductIds]);

  const dismissAccessDenied = useCallback(() => {
    setAccessDeniedOpen(false);
    goToAllowedProductHome();
  }, [goToAllowedProductHome]);

  // Non-owners can't stay on owner-only workspace hubs (All customers).
  useEffect(() => {
    if (role === "owner") return;
    if (!OWNER_WORKSPACE_TABS.includes(activeTab)) return;
    setAccessDeniedOpen(true);
    goToAllowedProductHome();
  }, [role, activeTab, goToAllowedProductHome]);

  // Analytics is managers + owners only.
  useEffect(() => {
    if (!ANALYTICS_WORKSPACE_TABS.includes(activeTab)) return;
    if (canViewAnalytics(role)) return;
    setAccessDeniedOpen(true);
    goToAllowedProductHome();
  }, [role, activeTab, goToAllowedProductHome]);

  // Business settings page is managers + owners; store identity is owner-only inside.
  useEffect(() => {
    if (!BUSINESS_SETTINGS_TABS.includes(activeTab)) return;
    if (canAccessBusinessSettingsPage(role)) return;
    setAccessDeniedOpen(true);
    goToAllowedProductHome();
  }, [role, activeTab, goToAllowedProductHome]);

  // Wrong product for this teammate — bounce home silently (no error sheet).
  // Common when /merchant still soft-navigates, or a stale deep link opens.
  const productBounceRef = useRef(false);
  useEffect(() => {
    const pathBlocked =
      !!productFromPath &&
      !memberCanAccessProduct(role, memberProductIds, productFromPath);
    const stateBlocked = !memberCanAccessProduct(role, memberProductIds, activeProduct);
    if (!pathBlocked && !stateBlocked) {
      productBounceRef.current = false;
      return;
    }
    if (productBounceRef.current) return;
    productBounceRef.current = true;
    goToAllowedProductHome();
  }, [role, memberProductIds, activeProduct, productFromPath, goToAllowedProductHome]);

  const [profile, setProfile] = useState<MerchantProfile>(initialProfile);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrProduct, setQrProduct] = useState<MerchantProduct>("loyalty");
  const [hubQrOpen, setHubQrOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [inAppNotifications, setInAppNotifications] =
    useState<MerchantInAppNotification[]>(initialNotifications);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editSection, setEditSection] = useState<MerchantEditSection>(null);
  /** Set only when the merchant picks a branch inside the settings sheet. */
  const [editBranchId, setEditBranchId] = useState<string | null>(null);
  const [purchaseProductTarget, setPurchaseProductTarget] = useState<MerchantProduct | null>(null);
  /** Specific pack for ProductPurchaseDrawer (next upgrade tier from upsells). */
  const [purchasePlanId, setPurchasePlanId] = useState<string | null>(null);
  const [comingSoonProduct, setComingSoonProduct] = useState<ComingSoonProduct | null>(null);
  const [manageView, setManageView] = useState<"branches" | "team" | null>(null);
  const [railExpanded, setRailExpanded] = useState(true);
  const [queueTicketsUsed, setQueueTicketsUsed] = useState<number | null>(null);
  const [reservationsUsed, setReservationsUsed] = useState<number | null>(null);
  const [menuChatsUsed, setMenuChatsUsed] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("froq.railExpanded");
      // Default open; only collapse when the user previously chose icons-only.
      if (saved === "0") setRailExpanded(false);
      else if (saved === "1") setRailExpanded(true);
    } catch {
      /* private mode */
    }
  }, []);

  // Sidebar queue meter — aggregate served+left across ALL branches (same as History quota).
  // Note: loadQueueHistoryView(url, null) reads the literal `:all` key, not every branch.
  useEffect(() => {
    if (activeProduct !== "queue") {
      setQueueTicketsUsed(null);
      return;
    }

    const branchIds = branches.map((b) => b.id);

    const refreshTickets = () => {
      try {
        ensureQueueDataEpoch();
        const queueUrl = joinUrlFor(profile, "queue");
        const onTrial = isTrialActive(entitlements.queue);
        const startMs = queueUsageWindowStartMs({
          onTrial,
          trialStartedAt: entitlements.queue?.trialStartedAt,
        });
        setQueueTicketsUsed(
          countQueueTicketsUsedInWindow(queueUrl, branchIds, startMs),
        );
      } catch {
        setQueueTicketsUsed(0);
      }
    };

    refreshTickets();
    const onHistory = () => refreshTickets();
    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (
        event.key.startsWith("froq.queue.history:") ||
        event.key.startsWith("froq.queue.session:")
      ) {
        refreshTickets();
      }
    };
    window.addEventListener("froq:queue-history", onHistory);
    window.addEventListener("focus", onHistory);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("froq:queue-history", onHistory);
      window.removeEventListener("focus", onHistory);
      window.removeEventListener("storage", onStorage);
    };
  }, [activeProduct, profile, entitlements.queue, branches]);

  // Sidebar reservation meter — bookings in the trial window / calendar month.
  useEffect(() => {
    if (activeProduct !== "reservation") {
      setReservationsUsed(null);
      return;
    }

    let cancelled = false;
    const refresh = () => {
      void countReservationsUsedForPlanMeter().then((result) => {
        if (cancelled) return;
        setReservationsUsed(result.ok ? result.count : 0);
      });
    };

    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [activeProduct, entitlements.reservation]);

  // Sidebar AI Menu meter — monthly AI Replies only (no AI Generations here).
  useEffect(() => {
    if (activeProduct !== "menu") {
      setMenuChatsUsed(null);
      return;
    }

    let cancelled = false;
    const refresh = () => {
      void countMenuUsedForPlanMeter().then((result) => {
        if (cancelled) return;
        setMenuChatsUsed(result.ok ? result.conversations : 0);
      });
    };

    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [activeProduct, entitlements.menu]);

  const planMetricUsed =
    activeProduct === "loyalty"
      ? dashboardStats.totalCustomers
      : activeProduct === "queue"
        ? queueTicketsUsed
        : activeProduct === "reservation"
          ? reservationsUsed
          : activeProduct === "menu"
            ? menuChatsUsed
            : null;
  const toggleRailExpanded = useCallback(() => {
    setRailExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("froq.railExpanded", next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  // Latches: mount heavy drawers after first open so cold load skips their
  // chunks, while later close/reopen keeps exit animations + internal state.
  const [qrOpened, setQrOpened] = useState(false);
  const [hubQrOpened, setHubQrOpened] = useState(false);
  const [redeemOpened, setRedeemOpened] = useState(false);
  const [purchaseOpened, setPurchaseOpened] = useState(false);
  const [manageOpened, setManageOpened] = useState(false);

  useEffect(() => setProfile(initialProfile), [initialProfile]);
  useEffect(() => {
    if (qrOpen) setQrOpened(true);
  }, [qrOpen]);
  // Mount the chunk on first open and keep it mounted, so reopening still animates.
  const openHubQr = useCallback(() => {
    setHubQrOpened(true);
    setHubQrOpen(true);
  }, []);
  useEffect(() => {
    if (redeemOpen) setRedeemOpened(true);
  }, [redeemOpen]);
  useEffect(() => {
    if (purchaseProductTarget) setPurchaseOpened(true);
  }, [purchaseProductTarget]);
  useEffect(() => {
    if (manageView) setManageOpened(true);
  }, [manageView]);

  const openQr = useCallback(
    (product?: MerchantProduct) => {
      void (async () => {
        const soleBranchId =
          productSwitcherBranches.length === 1
            ? (productSwitcherBranches[0]?.id ?? null)
            : null;
        const branchId = activeBranchId ?? soleBranchId;
        if (!branchId) {
          toast.error("Select a branch to show its QR code.");
          return;
        }
        // Header can show the sole branch while activeBranchId is still null —
        // latch the id before opening so the QR drawer has a concrete branch.
        if (!activeBranchId && soleBranchId) {
          await onSelectBranch(soleBranchId);
        }
        const resolved =
          product ?? productForPathname(pathname) ?? activeProduct;
        setQrProduct(resolved);
        setQrOpen(true);
      })();
    },
    [pathname, activeProduct, activeBranchId, productSwitcherBranches, onSelectBranch],
  );

  const openRedeem = useCallback(() => {
    void (async () => {
      const soleBranchId =
        productSwitcherBranches.length === 1
          ? (productSwitcherBranches[0]?.id ?? null)
          : null;
      const branchId = activeBranchId ?? soleBranchId;
      if (!branchId) {
        toast.error("Select a branch to redeem a reward.");
        return;
      }
      if (!activeBranchId && soleBranchId) {
        await onSelectBranch(soleBranchId);
      }
      setRedeemOpen(true);
    })();
  }, [activeBranchId, productSwitcherBranches, onSelectBranch]);

  // Navigate to a tab by pushing its route (URL is the source of truth).
  const goToTab = useCallback(
    (tab: MerchantTab) => {
      if (tab === "scan") {
        openRedeem();
        return;
      }
      if (OWNER_WORKSPACE_TABS.includes(tab) && role !== "owner") {
        setAccessDeniedOpen(true);
        return;
      }
      if (ANALYTICS_WORKSPACE_TABS.includes(tab) && !canViewAnalytics(role)) {
        setAccessDeniedOpen(true);
        return;
      }
      if (BUSINESS_SETTINGS_TABS.includes(tab) && !canAccessBusinessSettingsPage(role)) {
        setAccessDeniedOpen(true);
        return;
      }
      const product = productForTab(tab);
      if (product && !memberCanAccessProduct(role, memberProductIds, product)) {
        setAccessDeniedOpen(true);
        return;
      }
      if (tab === pathTab) {
        setPendingTab(null);
        return;
      }
      if (product) setActiveProduct(product);
      setPendingTab(tab);
      startNavTransition(() => {
        router.push(TAB_HREF[tab]);
      });
    },
    [router, role, pathTab, memberProductIds, openRedeem],
  );

  // Switch product from the rail and land on that product's default tab.
  const goToProduct = useCallback(
    (product: MerchantProduct) => {
      if (!memberCanAccessProduct(role, memberProductIds, product)) {
        setAccessDeniedOpen(true);
        return;
      }
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
    [router, pathTab, role, memberProductIds],
  );

  // After a successful in-dashboard purchase: refresh entitlements and route to
  // the new product (its onboarding gate will take over automatically).
  const handlePurchased = useCallback(
    async (product: MerchantProduct) => {
      setPurchaseProductTarget(null);
      setPurchasePlanId(null);
      await onRefresh();
      setActiveProduct(product);
      router.push(TAB_HREF[PRODUCT_DEFAULT_TAB[product]]);
    },
    [onRefresh, router],
  );

  const openPurchase = useCallback(
    (product: MerchantProduct, planId?: string | null) => {
      if (role !== "owner") {
        toast.error("Only the owner can add or manage products.");
        return;
      }
      // Existing paid subscribers change packs on Manage plan (schedule at renewal).
      if (isPaidPlanId(entitlements[product]?.planId)) {
        const path =
          product === "queue"
            ? "/merchant/queue/plan"
            : product === "reservation"
              ? "/merchant/reservations/plan"
              : product === "menu"
                ? "/merchant/menu/plan"
                : "/merchant/loyalty/plan";
        router.push(path);
        return;
      }
      const summary = planUpgradeSummary({
        product,
        planId: entitlements[product]?.planId,
      });
      setPurchasePlanId(planId ?? summary.nextPlan?.id ?? null);
      setPurchaseProductTarget(product);
    },
    [role, entitlements, router],
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

  // Safety net for the realtime socket: phones suspend it on lock, and captive
  // or corporate Wi-Fi can drop the websocket entirely. Without this a pending
  // stamp only appears on a manual reload.
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    const REFRESH_THROTTLE_MS = 10_000;
    const POLL_MS = 60_000;

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return;
      lastRefreshRef.current = now;
      void onRefresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") maybeRefresh();
    };

    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    const poll = setInterval(maybeRefresh, POLL_MS);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(poll);
    };
  }, [onRefresh]);

  // Welcome an invited teammate the first time they land on the dashboard.
  const welcomedRef = useRef(false);
  useEffect(() => {
    if (justJoined && !welcomedRef.current) {
      welcomedRef.current = true;
      toast.success(`Welcome to ${initialProfile.businessName}! You've joined the team.`);
    }
  }, [justJoined, initialProfile.businessName]);

  useEffect(() => {
    setInAppNotifications(initialNotifications);
  }, [initialNotifications]);

  // In-app cue when the pending queue grows while the dashboard is open.
  const [prevPending, setPrevPending] = useState(approvals.length);
  useEffect(() => {
    if (approvals.length > prevPending) {
      toast("New stamp request awaiting approval");
    }
    setPrevPending(approvals.length);
  }, [approvals.length, prevPending]);

  const openNotifications = useCallback(() => {
    setNotifOpen(true);
    const unreadIds = inAppNotifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setInAppNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    void markInAppNotificationsRead(unreadIds);
  }, [inAppNotifications]);

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
    (id: string) => run(() => rejectStamp(id), "Stamp rejected"),
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

  const handleSaveCustomerNotes = useCallback(
    async (id: string, notes: string) => {
      const res = await updateCustomerMerchantNotes(id, notes);
      if (!res.ok) return false;
      await onRefresh();
      return true;
    },
    [onRefresh],
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
    if (editSection === "business" && !canViewBusinessSettings(role)) {
      toast.error("Only the owner can edit store details.");
      return;
    }
    // Full-profile saves still include store identity fields; omit them for
    // non-owners so notifications/alerts aren't blocked by the owner-only gate.
    let patch: Partial<MerchantProfile> = profile;
    if (role !== "owner" && editSection !== "business") {
      const { businessName: _, brandColor: __, logoDataUrl: ___, ...rest } = profile;
      patch = rest;
    }
    const ok = await run(() => updateMerchantProfile(patch), "Changes saved");
    if (ok) setEditSection(null);
  }, [run, profile, role, editSection]);

  const openEditSection = useCallback(
    (section: MerchantEditSection) => {
      if (section === "business" && !canViewBusinessSettings(role)) {
        toast.error("Only the owner can edit store details.");
        return;
      }
      setEditSection(section);
    },
    [role],
  );

  const handleSaveBranchContact = useCallback(
    (branchId: string, patch: Partial<BranchContact>) =>
      run(() => updateBranch(branchId, patch), "Changes saved"),
    [run],
  );

  const closeEditSection = useCallback(() => {
    setEditSection(null);
    setEditBranchId(null);
  }, []);

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
      autoStart: boolean;
      autoClose: boolean;
    }) => {
      // Always the switcher selection (then main) — never contact editBranchId.
      const target =
        branches.find((b) => b.id === activeBranchId) ??
        branches.find((b) => b.isDefault) ??
        branches[0] ??
        null;
      const patch = {
        queueOpenTime: hours.openTime,
        queueCloseTime: hours.closeTime,
        queueHoursTimezone: "Asia/Kolkata" as const,
        queueOpenDays: hours.openDays,
        queueAutoStart: hours.autoStart,
        queueAutoClose: hours.autoClose,
      };
      // Main branch still mirrors onto merchants for legacy readers.
      if (!target || target.isDefault) {
        setProfile((prev) => ({ ...prev, ...patch }));
      }
      if (!target) {
        await run(() => updateMerchantProfile(patch), "Auto sessions saved");
        return;
      }
      await run(
        () => updateBranchQueueSettings(target.id, patch),
        "Auto sessions saved",
      );
    },
    [run, branches, activeBranchId],
  );

  const handleSaveEstimatedWait = useCallback(
    async (minutes: number) => {
      const target =
        branches.find((b) => b.id === activeBranchId) ??
        branches.find((b) => b.isDefault) ??
        branches[0] ??
        null;
      if (!target) return;
      await run(() =>
        updateBranchQueueSettings(target.id, {
          estimatedWaitMinutes: minutes,
        }),
      );
    },
    [run, branches, activeBranchId],
  );

  const handleSaveReservationSettings = useCallback(
    async (patch: Partial<MerchantProfile>) => {
      setProfile((prev) => ({ ...prev, ...patch }));
      await run(() => updateMerchantProfile(patch), "Reservation settings saved");
    },
    [run],
  );

  const handleSaveMenuSettings = useCallback(
    async (patch: Partial<MerchantProfile>) => {
      // Snapshot the exact keys being written rather than inferring how to undo
      // them: negating worked while these were all toggles, and would turn a
      // failed 9% GST save into nonsense now that rates ride the same path.
      const previous = Object.fromEntries(
        Object.keys(patch).map((key) => [key, profile[key as keyof MerchantProfile]]),
      ) as Partial<MerchantProfile>;
      setProfile((prev) => ({ ...prev, ...patch }));
      const ok = await run(() => updateMerchantProfile(patch), "Menu settings saved");
      if (!ok) setProfile((prev) => ({ ...prev, ...previous }));
    },
    [run, profile],
  );

  const handleSaveQueueSettings = useCallback(
    async (patch: Partial<MerchantProfile>) => {
      const previous = Object.fromEntries(
        Object.keys(patch).map((key) => [key, profile[key as keyof MerchantProfile]]),
      ) as Partial<MerchantProfile>;
      setProfile((prev) => ({ ...prev, ...patch }));
      const ok = await run(() => updateMerchantProfile(patch), "Queue settings saved");
      if (!ok) setProfile((prev) => ({ ...prev, ...previous }));
    },
    [run, profile],
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
    async (input: {
      name: string;
      contact?: Partial<BranchContact>;
      copyContactFromMainBranch?: boolean;
      hours?: { openTime: string; closeTime: string; openDays: number[] };
      assignToProduct?: MerchantProduct;
    }): Promise<string | null> => {
      const res = await createBranch({
        ...input,
        assignToProduct: input.assignToProduct ?? activeProduct,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Could not add branch");
        return null;
      }
      if (res.warning) toast.message(res.warning);
      else toast.success(res.assigned === false ? "Branch added" : "Branch added");
      await onRefresh();
      return res.branchId ?? null;
    },
    [onRefresh, activeProduct],
  );

  const onSetProductBranchAssignment = useCallback(
    async (input: {
      product: MerchantProduct;
      branchId: string;
      active: boolean;
    }) => {
      const res = await setProductBranchAssignment(input);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update branch");
        return false;
      }
      toast.success(input.active ? "Branch activated" : "Branch removed from product");
      await onRefresh();
      return true;
    },
    [onRefresh],
  );
  const onUpdateBranch = useCallback(
    (id: string, patch: Partial<BranchContact> & { name?: string }) =>
      run(() => updateBranch(id, patch), "Branch updated"),
    [run],
  );

  /** Branches drawer — contact details and store timings together. */
  const onSaveBranchDetails = useCallback(
    async (
      id: string,
      patch: Partial<BranchContact> & { name?: string },
      hours: { openTime: string; closeTime: string; openDays: number[] },
    ) => {
      const target =
        branches.find((b) => b.id === id) ??
        branches.find((b) => b.isDefault) ??
        null;
      const hoursPatch = {
        queueOpenTime: hours.openTime,
        queueCloseTime: hours.closeTime,
        queueHoursTimezone: "Asia/Kolkata" as const,
        queueOpenDays: hours.openDays,
        queueAutoStart: target?.queueAutoStart ?? false,
        queueAutoClose: target?.queueAutoClose ?? false,
      };
      return run(async () => {
        const contact = await updateBranch(id, patch);
        if (!contact.ok) return contact;
        const hoursRes = await updateBranchQueueSettings(id, hoursPatch);
        if (!hoursRes.ok) return hoursRes;
        if (target?.isDefault) {
          setProfile((prev) => ({
            ...prev,
            ...hoursPatch,
            reservationOpenTime: hours.openTime,
            reservationCloseTime: hours.closeTime,
          }));
          const seating = await updateMerchantProfile({
            reservationOpenTime: hours.openTime,
            reservationCloseTime: hours.closeTime,
          });
          if (!seating.ok) return seating;
        }
        return { ok: true };
      }, "Branch updated");
    },
    [run, branches],
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
      productIds?: MerchantProduct[];
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
    (
      id: string,
      memberRole: MemberRole,
      branchIds?: string[],
      productIds?: MerchantProduct[],
    ) => run(() => updateMemberRole(id, memberRole, branchIds, productIds), "Member updated"),
    [run],
  );
  const onRemoveMember = useCallback(
    (id: string) => run(() => removeMember(id), "Member removed"),
    [run],
  );

  const unreadNotifCount = inAppNotifications.filter((n) => !n.read).length;
  // Loyalty badge = live pending workload; otherwise unread in-app items.
  const notifCount =
    activeProduct === "loyalty" ? Math.max(approvals.length, unreadNotifCount) : unreadNotifCount;
  const activeBranch =
    productSwitcherBranches.find((b) => b.id === activeBranchId) ?? null;

  // Keep the switcher’s displayed branch honest for QR / redeem:
  // - Sticky id from another product → pick a valid one for this product.
  // - `null` with a single branch still shows that name in the trigger
  //   (`displayBranch = activeBranch ?? soleBranch`) but openQr requires an id
  //   — auto-select so Menu QR works without re-clicking the branch.
  // - `null` with multiple branches stays “All branches” on purpose.
  useEffect(() => {
    if (productSwitcherBranches.length === 0) return;
    if (activeBranchId != null && productSwitcherBranches.some((b) => b.id === activeBranchId)) {
      return;
    }
    if (activeBranchId == null && productSwitcherBranches.length > 1) return;
    const next =
      productSwitcherBranches.find((b) => b.isDefault)?.id ??
      productSwitcherBranches[0]?.id ??
      null;
    if (next == null || next === activeBranchId) return;
    void onSelectBranch(next);
  }, [activeProduct, activeBranchId, productSwitcherBranches, onSelectBranch]);

  // Contact settings always target a concrete branch. Follow the switcher, but
  // fall back to the main branch when it's on "All branches".
  const editBranch =
    branches.find((b) => b.id === editBranchId) ??
    activeBranch ??
    branches.find((b) => b.isDefault) ??
    branches[0] ??
    null;

  const me = currentUserId
    ? members.find((m) => m.userId === currentUserId)
    : undefined;
  /** Primary store owner (`merchants.owner_user_id`) — only they can wipe the business. */
  const isPrimaryOwnerAccount =
    me?.isPrimaryOwner === true || (role === "owner" && me == null);

  const resolveAccountNames = useCallback(() => {
    // Owners: prefer merchant profile owner fields (updated immediately from
    // Account settings). Staff/managers: prefer membership row.
    let first =
      (role === "owner" ? profile.ownerFirstName : "") || me?.firstName || "";
    let last =
      (role === "owner" ? profile.ownerLastName : "") || me?.lastName || "";
    if (!first && !last) {
      const parts = (me?.name || "").trim().split(/\s+/).filter(Boolean);
      first = parts[0] ?? "";
      last = parts.slice(1).join(" ");
    }
    return { first: first.trim(), last: last.trim() };
  }, [
    role,
    profile.ownerFirstName,
    profile.ownerLastName,
    me?.firstName,
    me?.lastName,
    me?.name,
  ]);

  const [accountFirstName, setAccountFirstName] = useState(
    () => resolveAccountNames().first,
  );
  const [accountLastName, setAccountLastName] = useState(
    () => resolveAccountNames().last,
  );

  useEffect(() => {
    const next = resolveAccountNames();
    setAccountFirstName(next.first);
    setAccountLastName(next.last);
  }, [resolveAccountNames]);

  // Live account name drives the sidebar/mobile user card for every role.
  const accountFullName = [accountFirstName, accountLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const sidebarUserName =
    accountFullName || me?.name.trim() || me?.email || profile.email;

  const workspaceValue = useMemo<MerchantWorkspaceValue>(
    () => ({
      profile,
      dashboardStats,
      customers,
      approvals,
      entitlements,
      branches,
      productBranches,
      members,
      role,
      activeBranchId,
      editBranch,
      canViewAllBranches,
      goToTab,
      onShowQr: openQr,
      onRedeemCode: openRedeem,
      onSelectBranch,
      onManageBranches: () => setManageView("branches"),
      onManageTeam: () => setManageView("team"),
      onPurchaseProduct: (product: MerchantProduct) => {
        openPurchase(product);
      },
      onRefresh,
      onCreateBranch,
      onSetProductBranchAssignment,
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
      onSaveCustomerNotes: handleSaveCustomerNotes,
      onRequestOfferStampOtp: handleRequestOfferStampOtp,
      onConfirmOfferStamp: handleConfirmOfferStamp,
      onEditSection: openEditSection,
      onSaveQueueBanner: handleSaveQueueBanner,
      onSaveQueueHours: handleSaveQueueHours,
      onSaveEstimatedWait: handleSaveEstimatedWait,
      onSaveReservationSettings: handleSaveReservationSettings,
      onSaveMenuSettings: handleSaveMenuSettings,
      onSaveQueueSettings: handleSaveQueueSettings,
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
      editBranch,
      canViewAllBranches,
      onSelectBranch,
      goToTab,
      openQr,
      openRedeem,
      openPurchase,
      onCreateBranch,
      onSetProductBranchAssignment,
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
      handleSaveCustomerNotes,
      handleRequestOfferStampOtp,
      handleConfirmOfferStamp,
      openEditSection,
      handleSaveQueueBanner,
      handleSaveQueueHours,
      handleSaveEstimatedWait,
      handleSaveReservationSettings,
      handleSaveMenuSettings,
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
  // takes over the screen (full-screen wizard) until completed. Plan pages stay
  // reachable so Upgrade CTAs from the branches step work mid-setup.
  if (
    productFromPath &&
    productNeedsOnboarding(entitlements, productFromPath) &&
    !pathname.endsWith("/plan")
  ) {
    return (
      <OnboardingWizard
        mode="product"
        product={productFromPath}
        profile={profile}
        branches={branches}
        entitlements={entitlements}
        onComplete={onRefresh}
      />
    );
  }

  return (
    <div
      className={`merchant-page merchant-page--app merchant-theme${railExpanded ? " is-rail-expanded" : ""}`}
    >
      <ProductRail
        activeProduct={activeProduct}
        activeTab={activeTab}
        expanded={railExpanded}
        onToggleExpand={toggleRailExpanded}
        onProductChange={goToProduct}
        onComingSoonProduct={setComingSoonProduct}
        onTabChange={goToTab}
        onShowHubQr={openHubQr}
        pendingCount={approvals.length}
        onLogout={onLogout}
      />

      <MerchantSidebar
        activeProduct={activeProduct}
        activeTab={activeTab}
        entitlements={entitlements}
        canPurchase={role === "owner"}
        planUsage={{
          branchesUsed: productSwitcherBranches.length || branches.length,
          metricUsed: planMetricUsed,
        }}
        userName={sidebarUserName}
        userRole={role}
        onTabChange={goToTab}
        onGetStarted={(product) => {
          openPurchase(product);
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
              branches={productSwitcherBranches}
              activeBranch={activeBranch}
              canManage={role === "owner"}
              allowAllBranches={canViewAllBranches && productSwitcherBranches.length > 1}
              onSelect={onSelectBranch}
              onAddBranch={() => setManageView("branches")}
              emptyCta={
                role === "owner"
                  ? {
                      label: "Assign a branch",
                      onClick: () =>
                        goToTab(
                          activeProduct === "loyalty"
                            ? "loyalty-settings"
                            : activeProduct === "queue"
                              ? "queue-settings"
                              : activeProduct === "reservation"
                                ? "reservations-settings"
                                : "menu-settings",
                        ),
                    }
                  : undefined
              }
            />
          </div>
          <div className="merchant-header-actions">
            <button
              type="button"
              className="merchant-icon-btn merchant-notif-btn"
              aria-label="Notifications"
              onClick={openNotifications}
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
                trialExpired={isTrialExpired(entitlements[lockedProduct])}
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
        onComingSoonProduct={setComingSoonProduct}
        onScan={openRedeem}
        pendingCount={approvals.length}
      />

      <MerchantProfileEditScreen
        section={editSection}
        profile={profile}
        accountFirstName={accountFirstName}
        accountLastName={accountLastName}
        role={role}
        productIds={me?.productIds ?? memberProductIds}
        branchIds={me?.branchIds ?? []}
        branches={branches}
        editBranch={editBranch}
        onChange={setProfile}
        onClose={closeEditSection}
        onSave={handleSaveProfile}
        onSaveBranch={handleSaveBranchContact}
        onSaveBranchDetails={onSaveBranchDetails}
        onSelectEditBranch={setEditBranchId}
        onAccountNameUpdated={(firstName, lastName) => {
          setAccountFirstName(firstName);
          setAccountLastName(lastName);
          if (role === "owner") {
            setProfile((prev) => ({
              ...prev,
              ownerFirstName: firstName,
              ownerLastName: lastName,
            }));
          }
          // Keep the signed-in member row in sync so refresh races can't flash
          // the previous name on the user card.
          void onRefresh();
        }}
        onDeleteAccount={
          isPrimaryOwnerAccount
            ? undefined
            : () => {
                closeEditSection();
                setDeleteOpen(true);
              }
        }
      />

      <MerchantMobileMenu
        open={menuOpen}
        activeTab={activeTab}
        activeProduct={activeProduct}
        role={role}
        entitlements={entitlements}
        canPurchase={role === "owner"}
        planUsage={{
          branchesUsed: productSwitcherBranches.length || branches.length,
          metricUsed: planMetricUsed,
        }}
        userName={sidebarUserName}
        onTabChange={goToTab}
        onProductChange={goToProduct}
        onComingSoonProduct={setComingSoonProduct}
        onUpgrade={(product) => {
          openPurchase(product);
        }}
        onOpenAccount={() => setEditSection("account")}
        onShowHubQr={openHubQr}
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
          branchName={activeBranch?.name ?? null}
          onClose={() => setQrOpen(false)}
        />
      )}

      {hubQrOpened && (
        <HubQrDrawer
          open={hubQrOpen}
          profile={profile}
          entitlements={entitlements}
          branchSlug={activeBranch && !activeBranch.isDefault ? activeBranch.slug : null}
          branchName={activeBranch && !activeBranch.isDefault ? activeBranch.name : null}
          onClose={() => setHubQrOpen(false)}
        />
      )}

      {redeemOpened && (
        <RedeemDrawer
          open={redeemOpen}
          onClose={() => setRedeemOpen(false)}
          onRedeem={handleRedeem}
        />
      )}

      <ComingSoonProductDrawer
        product={comingSoonProduct}
        onClose={() => setComingSoonProduct(null)}
      />

      <AccessDeniedDrawer open={accessDeniedOpen} onClose={dismissAccessDenied} />

      {purchaseOpened && (
        <ProductPurchaseDrawer
          product={purchaseProductTarget}
          planId={purchasePlanId}
          onClose={() => {
            setPurchaseProductTarget(null);
            setPurchasePlanId(null);
          }}
          onPurchased={handlePurchased}
        />
      )}

      {manageOpened && (
        <BranchesTeamDrawer
          view={manageView}
          branches={branches}
          productBranches={productBranches}
          businessName={profile.businessName}
          members={members}
          role={role}
          onCreateBranch={onCreateBranch}
          onSaveBranchDetails={onSaveBranchDetails}
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
        notifications={inAppNotifications}
        onViewApprovals={() => goToTab("dashboard")}
        onApprove={handleApprove}
        onDisapprove={handleDisapprove}
        onClose={() => setNotifOpen(false)}
      />

      <DeleteAccountDrawer
        open={deleteOpen}
        accountName={profile.businessName}
        title={isPrimaryOwnerAccount ? "Delete account" : "Delete your account"}
        description={
          isPrimaryOwnerAccount
            ? "This permanently deletes your store, customers, loyalty data, and QR code. This cannot be undone."
            : "This removes you from this store and permanently deletes your Froq login. The store and its data stay with the owner."
        }
        confirmLabel={isPrimaryOwnerAccount ? "Delete account" : "Delete my account"}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          const res = await deleteMerchantAccount();
          if (res.ok) {
            toast.success(
              isPrimaryOwnerAccount ? "Account deleted" : "Your account was deleted",
            );
            onLogout?.();
          }
          return res;
        }}
      />
    </div>
  );
}
