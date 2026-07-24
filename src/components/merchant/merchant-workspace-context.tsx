"use client";

import { createContext, useContext } from "react";
import type {
  Branch,
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
  branches: Branch[];
  members: MerchantMember[];
  role: MemberRole;
  activeBranchId: string | null;
  canViewAllBranches: boolean;
  avgOrderValue: number;
  goToTab: (tab: MerchantTab) => void;
  onShowQr: () => void;
  onSelectBranch: (branchId: string | null) => void;
  onManageBranches: () => void;
  onManageTeam: () => void;
  onPurchaseProduct: (product: MerchantProduct) => void;
  onCreateBranch: (input: { name: string; address?: string }) => Promise<string | null>;
  onUpdateBranch: (id: string, patch: { name?: string; address?: string }) => Promise<boolean>;
  onDeleteBranch: (id: string) => Promise<boolean>;
  onInviteMember: (input: {
    email: string;
    name?: string;
    role: MemberRole;
    branchIds?: string[];
  }) => Promise<boolean>;
  onUpdateMemberRole: (
    id: string,
    role: MemberRole,
    branchIds?: string[],
  ) => Promise<boolean>;
  onRemoveMember: (id: string) => Promise<boolean>;
  onApprove: (id: string) => void;
  onDisapprove: (id: string) => void;
  onRedeem: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onBanCustomer: (id: string) => void;
  onDeleteCustomer: (id: string) => void;
  onOfferStamp: (id: string) => Promise<boolean>;
  onEditSection: (section: MerchantEditSection) => void;
  onSaveQueueBanner: (queueBanner: string, queueBannerLink: string) => Promise<void>;
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
