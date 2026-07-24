"use client";

import { MerchantProfileScreen } from "@/components/merchant/profile-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function BusinessSettingsPage() {
  const {
    profile,
    role,
    branches,
    members,
    onEditSection,
    onManageBranches,
    onManageTeam,
    onLogout,
    onDeleteAccount,
  } = useMerchantWorkspace();
  return (
    <MerchantProfileScreen
      profile={profile}
      role={role}
      branchCount={branches.length}
      memberCount={members.length}
      onEditSection={onEditSection}
      onManageBranches={onManageBranches}
      onManageTeam={onManageTeam}
      onLogout={onLogout}
      onDeleteAccount={onDeleteAccount}
    />
  );
}
