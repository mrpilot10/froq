import type { MemberRole } from "./types";

/** Roles that may view customer phone/email and loyalty CRM details. */
export function canViewCustomerData(role: MemberRole): boolean {
  return role === "owner" || role === "manager";
}

/** Ban / delete customers (owners only). */
export function canModerateCustomers(role: MemberRole): boolean {
  return role === "owner";
}

/** Permanently delete an archived queue session and its guest records. */
export function canDeleteQueueSessions(role: MemberRole): boolean {
  return role === "owner" || role === "manager";
}

/** Invite / edit / remove team members (owners only). */
export function canManageTeam(role: MemberRole): boolean {
  return role === "owner";
}

/** Edit dishes, upload menus, and guest feature toggles (not floor staff). */
export function canEditMenu(role: MemberRole): boolean {
  return role === "owner" || role === "manager";
}

/** Workspace-level All customers hub (owners only). */
export function canViewWorkspaceHubs(role: MemberRole): boolean {
  return role === "owner";
}

/** Analytics hub — owners and managers only. */
export function canViewAnalytics(role: MemberRole): boolean {
  return role === "owner" || role === "manager";
}

/**
 * Global store settings (logo, brand color, business name) — owners only.
 * Managers still reach `/merchant/settings` for Account / branch details.
 */
export function canViewBusinessSettings(role: MemberRole): boolean {
  return role === "owner";
}

/** Business settings page — owners and managers (staff are denied). */
export function canAccessBusinessSettingsPage(role: MemberRole): boolean {
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
  owner: "Full access to team, settings, customers, analytics, and billing.",
  manager: "Customer details, analytics, settings, and stamps via OTP.",
  staff: "Stamps via OTP only — no customer data, analytics, or settings.",
};

export function normalizeMemberRole(role: string | null | undefined): MemberRole {
  if (role === "owner" || role === "manager" || role === "staff") return role;
  return "staff";
}
