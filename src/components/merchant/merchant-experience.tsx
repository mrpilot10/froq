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
import type { Branch, MemberRole, MerchantCustomer, MerchantEditSection, MerchantInAppNotification, MerchantMember, MerchantProduct, MerchantProfile, MerchantTab, PendingApproval, DashboardFilteredStats } from "@/lib/merchant/types";
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
  updateBranch,
  updateCustomerMerchantNotes,
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
import { ComingSoonProductDrawer } from "./coming-soon-product-drawer";
import { AccessDeniedDrawer } from "./access-denied-drawer";
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
import { accessibleProducts, memberCanAccessProduct } from "@/lib/merchant/product-access";
import { canViewAnalytics, canViewBusinessSettings } from "@/lib/merchant/roles";
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
  inAppNotifications?: MerchantInAppNotification[];
  entitlements: Entitlements;
  branches: Branch[];
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
  const [activeProduct, setActiveProduct] = useState<MerchantProduct>(
    productFromPath ?? "loyalty",
  );
  useEffect(() => {
    if (!productFromPath || productFromPath === activeProduct) return;
    // Don't adopt a product the teammate isn't allowed to open — the access
    // gate below will send them home and show the warning.
    if (!memberCanAccessProduct(role, memberProductIds, productFromPath)) return;
    setActiveProduct(productFromPath);
  }, [productFromPath, activeProduct, role, memberProductIds]);

  // Warm the App Router cache so tab switches feel instant.
  useEffect(() => {
    for (const tab of ALL_TABS) {
      if (tab === "scan" || tab === "approvals") continue;
      router.prefetch(TAB_HREF[tab]);
    }
  }, [router]);

  const allowedProducts = useMemo(
    () => accessibleProducts(role, memberProductIds, PRODUCTS.map((p) => p.id)),
    [role, memberProductIds],
  );

  const [accessDeniedOpen, setAccessDeniedOpen] = useState(false);

  const goToAllowedProductHome = useCallback(() => {
    const fallback = allowedProducts[0] ?? "loyalty";
    setActiveProduct(fallback);
    const tab = PRODUCT_DEFAULT_TAB[fallback];
    setPendingTab(tab);
    router.replace(TAB_HREF[tab]);
  }, [allowedProducts, router]);

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

  // Global business settings is managers + owners only.
  useEffect(() => {
    if (!BUSINESS_SETTINGS_TABS.includes(activeTab)) return;
    if (canViewBusinessSettings(role)) return;
    setAccessDeniedOpen(true);
    goToAllowedProductHome();
  }, [role, activeTab, goToAllowedProductHome]);

  // Teammates with restricted product access can't stay on a product they weren't granted.
  useEffect(() => {
    const pathBlocked =
      !!productFromPath &&
      !memberCanAccessProduct(role, memberProductIds, productFromPath);
    const stateBlocked = !memberCanAccessProduct(role, memberProductIds, activeProduct);
    if (!pathBlocked && !stateBlocked) return;
    setAccessDeniedOpen(true);
    goToAllowedProductHome();
  }, [role, memberProductIds, activeProduct, productFromPath, goToAllowedProductHome]);

  const [profile, setProfile] = useState<MerchantProfile>(initialProfile);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrProduct, setQrProduct] = useState<MerchantProduct>("loyalty");
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [inAppNotifications, setInAppNotifications] =
    useState<MerchantInAppNotification[]>(initialNotifications);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editSection, setEditSection] = useState<MerchantEditSection>(null);
  const [purchaseProductTarget, setPurchaseProductTarget] = useState<MerchantProduct | null>(null);
  const [comingSoonProduct, setComingSoonProduct] = useState<ComingSoonProduct | null>(null);
  const [manageView, setManageView] = useState<"branches" | "team" | null>(null);
  const [railExpanded, setRailExpanded] = useState(true);

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

  const openQr = useCallback(
    (product?: MerchantProduct) => {
      if (!activeBranchId) {
        toast.error("Select a branch to show its QR code.");
        return;
      }
      const resolved =
        product ?? productForPathname(pathname) ?? activeProduct;
      setQrProduct(resolved);
      setQrOpen(true);
    },
    [pathname, activeProduct, activeBranchId],
  );

  const openRedeem = useCallback(() => {
    if (!activeBranchId) {
      toast.error("Select a branch to redeem a reward.");
      return;
    }
    setRedeemOpen(true);
  }, [activeBranchId]);

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
      if (BUSINESS_SETTINGS_TABS.includes(tab) && !canViewBusinessSettings(role)) {
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
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;

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
      members,
      role,
      activeBranchId,
      canViewAllBranches,
      goToTab,
      onShowQr: openQr,
      onRedeemCode: openRedeem,
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
      onSaveCustomerNotes: handleSaveCustomerNotes,
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
      openRedeem,
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
      handleSaveCustomerNotes,
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
        onChange={setProfile}
        onClose={() => setEditSection(null)}
        onSave={handleSaveProfile}
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
                setEditSection(null);
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
        userName={sidebarUserName}
        onTabChange={goToTab}
        onProductChange={goToProduct}
        onComingSoonProduct={setComingSoonProduct}
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
          branchName={activeBranch?.name ?? null}
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

      <ComingSoonProductDrawer
        product={comingSoonProduct}
        onClose={() => setComingSoonProduct(null)}
      />

      <AccessDeniedDrawer open={accessDeniedOpen} onClose={dismissAccessDenied} />

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
