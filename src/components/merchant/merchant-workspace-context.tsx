"use client";

import { createContext, useContext } from "react";
import type {
  Branch,
  BranchContact,
  DashboardFilteredStats,
  MemberRole,
  MerchantCustomer,
  MerchantEditSection,
  MerchantMember,
  MerchantProduct,
  MerchantProfile,
  MerchantTab,
  PendingApproval,
} from "@/lib/merchant/types";
import type { Entitlements } from "@/lib/merchant/entitlements";
import type { ProductBranchMap } from "@/lib/merchant/branch-assignments";

/**
 * Shared data + handlers for every merchant dashboard route. The workspace
 * shell (rail, sidebar, header, drawers) owns the state and provides it here so
 * each page component can render inside its own URL without prop drilling.
 */
export interface MerchantWorkspaceValue {
  profile: MerchantProfile;
  dashboardStats: DashboardFilteredStats;
  customers: MerchantCustomer[];
  approvals: PendingApproval[];
  entitlements: Entitlements;
  /** Every global branch on the merchant account. */
  branches: Branch[];
  /** Active branch ids keyed by product. */
  productBranches: ProductBranchMap;
  members: MerchantMember[];
  role: MemberRole;
  activeBranchId: string | null;
  /** Concrete branch that contact settings read and write (never null with branches). */
  editBranch: Branch | null;
  canViewAllBranches: boolean;
  goToTab: (tab: MerchantTab) => void;
  onShowQr: (product?: MerchantProduct) => void;
  onRedeemCode: () => void;
  onSelectBranch: (branchId: string | null) => void;
  onManageBranches: () => void;
  onManageTeam: () => void;
  onPurchaseProduct: (product: MerchantProduct) => void;
  onRefresh: () => Promise<void>;
  onCreateBranch: (input: {
    name: string;
    contact?: Partial<BranchContact>;
    copyContactFromMainBranch?: boolean;
    hours?: { openTime: string; closeTime: string; openDays: number[] };
    assignToProduct?: MerchantProduct;
  }) => Promise<string | null>;
  onSetProductBranchAssignment: (input: {
    product: MerchantProduct;
    branchId: string;
    active: boolean;
  }) => Promise<boolean>;
  onUpdateBranch: (
    id: string,
    patch: Partial<BranchContact> & { name?: string },
  ) => Promise<boolean>;
  onDeleteBranch: (id: string) => Promise<boolean>;
  onInviteMember: (input: {
    email: string;
    name?: string;
    role: MemberRole;
    branchIds?: string[];
    productIds?: MerchantProduct[];
  }) => Promise<boolean>;
  onUpdateMemberRole: (
    id: string,
    role: MemberRole,
    branchIds?: string[],
    productIds?: MerchantProduct[],
  ) => Promise<boolean>;
  onRemoveMember: (id: string) => Promise<boolean>;
  onApprove: (id: string) => void;
  onDisapprove: (id: string) => void;
  onRedeem: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onBanCustomer: (id: string) => void;
  onDeleteCustomer: (id: string) => void;
  onSaveCustomerNotes: (id: string, notes: string) => Promise<boolean>;
  onRequestOfferStampOtp: (customerId: string) => Promise<{
    ok: boolean;
    error?: string;
    message?: string;
    channel?: "whatsapp" | "sms";
    retryAfter?: number;
  }>;
  onConfirmOfferStamp: (
    customerId: string,
    code: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onEditSection: (section: MerchantEditSection) => void;
  onSaveQueueBanner: (queueBanner: string, queueBannerLink: string) => Promise<void>;
  onSaveQueueHours: (hours: {
    openTime: string;
    closeTime: string;
    openDays: number[];
    autoStart: boolean;
    autoClose: boolean;
  }) => Promise<void>;
  onSaveEstimatedWait: (minutes: number) => Promise<void>;
  onSaveReservationSettings: (patch: Partial<MerchantProfile>) => Promise<void>;
  onSaveMenuSettings: (patch: Partial<MerchantProfile>) => Promise<void>;
  onSaveQueueSettings: (patch: Partial<MerchantProfile>) => Promise<void>;
  /** Stop / resume public booking requests, like pausing the live queue. */
  onSetReservationPaused: (paused: boolean) => Promise<void>;
  onDeleteAccount: () => void;
  onLogout?: () => void;
}

const MerchantWorkspaceContext = createContext<MerchantWorkspaceValue | null>(null);

export const MerchantWorkspaceProvider = MerchantWorkspaceContext.Provider;

export function useMerchantWorkspace(): MerchantWorkspaceValue {
  const value = useContext(MerchantWorkspaceContext);
  if (!value) {
    throw new Error("useMerchantWorkspace must be used within the merchant dashboard layout");
  }
  return value;
}
