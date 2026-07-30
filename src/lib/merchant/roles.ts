import type { MemberRole } from "./types";

/** Roles that may view customer phone/email and loyalty CRM details. */
export function canViewCustomerData(role: MemberRole): boolean {
  return role === "owner" || role === "manager";
}

/** Ban / delete customers (owners only). */
export function canModerateCustomers(role: MemberRole): boolean {
  return role === "owner";
}

/** Invite / edit / remove team members (owners only). */
export function canManageTeam(role: MemberRole): boolean {
  return role === "owner";
}

/** Workspace-level All customers hub (owners only). */
export function canViewWorkspaceHubs(role: MemberRole): boolean {
  return role === "owner";
}

/** Analytics hub — owners and managers only. */
export function canViewAnalytics(role: MemberRole): boolean {
  return role === "owner" || role === "manager";
}

/** Roles assignable when inviting or editing a teammate. */
export const ASSIGNABLE_ROLES: MemberRole[] = ["owner", "manager", "staff"];

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export const ROLE_HINTS: Record<MemberRole, string> = {
  owner: "Full access — team, settings, customers, analytics, and billing.",
  manager: "Sees customer details, analytics, and can offer stamps via OTP.",
  staff: "Can offer stamps via OTP only — contact details and analytics stay hidden.",
};

export function normalizeMemberRole(role: string | null | undefined): MemberRole {
  if (role === "owner" || role === "manager" || role === "staff") return role;
  return "staff";
}
