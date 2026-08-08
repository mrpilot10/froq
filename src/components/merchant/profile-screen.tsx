import { ChevronRight, LogOut, MapPin, Settings, Store, Users } from "lucide-react";
import Image from "next/image";
import type {
  Branch,
  MemberRole,
  MerchantEditSection,
  MerchantProfile,
} from "@/lib/merchant/types";
import {
  canManageTeam,
  canViewBusinessSettings,
} from "@/lib/merchant/roles";
import { formatHoursSummary } from "@/lib/merchant/queue-hours";
import { hoursFromBranch } from "./queue/queue-hours-fields";

interface MerchantProfileScreenProps {
  profile: MerchantProfile;
  role: MemberRole;
  branchCount: number;
  memberCount: number;
  /** Branch whose contact details the branch-scoped rows will open. */
  editBranch?: Branch | null;
  onEditSection: (section: MerchantEditSection) => void;
  onManageBranches: () => void;
  onManageTeam: () => void;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}

type SettingsRow = {
  id: MerchantEditSection;
  label: string;
  value: string | ((branch: Branch | null) => string);
  Icon: typeof Store;
};

const STORE_ROWS: SettingsRow[] = [
  { id: "business", label: "Store details", value: "Logo, brand color & name", Icon: Store },
];

/** Writes to a single branch — a chain publishes different details per location. */
const BRANCH_ROWS: SettingsRow[] = [
  {
    id: "branch",
    label: "Branch details",
    value: branchSummary,
    Icon: MapPin,
  },
];

function branchSummary(branch: Branch | null): string {
  if (!branch) return "Add a branch to publish details";
  const hours = formatHoursSummary({
    ...hoursFromBranch(branch),
    autoStart: false,
    autoClose: false,
  });
  const filled = [
    branch.address,
    branch.phone,
    branch.email,
    branch.websiteUrl,
    branch.instagramUrl,
    branch.facebookUrl,
    branch.xUrl,
    branch.googleBusinessUrl,
  ].filter((v) => v?.trim()).length;
  if (filled === 0) return hours;
  const listing = branch.googlePlaceId?.trim() || branch.googleMapsUrl?.trim();
  return `${hours} · ${filled} detail${filled === 1 ? "" : "s"}${listing ? " · Google" : ""}`;
}

const ACCOUNT_ROWS: SettingsRow[] = [
  { id: "account", label: "Account settings", value: "Email, phone, security", Icon: Settings },
];

export function MerchantProfileScreen({
  profile,
  role,
  branchCount,
  memberCount,
  editBranch = null,
  onEditSection,
  onManageBranches,
  onManageTeam,
  onLogout,
  onDeleteAccount,
}: MerchantProfileScreenProps) {
  const canManageBranches = role === "owner";
  const showTeam = canManageTeam(role);
  const showStoreDetails = canViewBusinessSettings(role);
  const initials = profile.businessName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const settingsGroups = [
    ...(showStoreDetails ? [{ title: "Store", rows: STORE_ROWS }] : []),
    {
      title: editBranch ? `Branch · ${editBranch.name}` : "Branch",
      rows: BRANCH_ROWS,
    },
    { title: "Account", rows: ACCOUNT_ROWS },
  ];

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Business settings</h2>
        <p className="tab-sub">
          {showStoreDetails
            ? "Manage your store identity and account"
            : "Manage your branch details and account"}
        </p>
      </div>

      <div className="panel-card profile-panel merchant-identity-card">
        <div className="profile-hero">
          <div
            className="profile-avatar merchant-profile-avatar"
            style={
              profile.logoDataUrl
                ? undefined
                : { background: profile.brandColor, color: "#fff" }
            }
          >
            {profile.logoDataUrl ? (
              <Image
                src={profile.logoDataUrl}
                alt={profile.businessName}
                width={64}
                height={64}
                unoptimized
                className="merchant-profile-logo-img"
              />
            ) : (
              initials
            )}
          </div>
          <div>
            <h3 className="profile-name">{profile.businessName}</h3>
            <p className="profile-meta">
              {editBranch?.address?.trim() || "Add your store address"}
            </p>
          </div>
        </div>
      </div>

      {(canManageBranches || showTeam) && (
        <div className="merchant-settings-group">
          <h3 className="merchant-settings-title">Workspace</h3>
          <div className="panel-card merchant-settings-panel">
            {canManageBranches && (
              <button type="button" className="merchant-settings-row" onClick={onManageBranches}>
                <div className="profile-row-icon">
                  <MapPin size={18} strokeWidth={2.2} />
                </div>
                <div className="profile-row-copy">
                  <div className="profile-row-label">Branches</div>
                  <div className="profile-row-value profile-row-value--soft">
                    {branchCount} {branchCount === 1 ? "location" : "locations"}
                  </div>
                </div>
                <ChevronRight size={16} strokeWidth={2.2} className="profile-row-arrow" />
              </button>
            )}
            {showTeam && (
              <button type="button" className="merchant-settings-row" onClick={onManageTeam}>
                <div className="profile-row-icon">
                  <Users size={18} strokeWidth={2.2} />
                </div>
                <div className="profile-row-copy">
                  <div className="profile-row-label">Team</div>
                  <div className="profile-row-value profile-row-value--soft">
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </div>
                </div>
                <ChevronRight size={16} strokeWidth={2.2} className="profile-row-arrow" />
              </button>
            )}
          </div>
        </div>
      )}

      {settingsGroups.map((group) => (
        <div key={group.title} className="merchant-settings-group">
          <h3 className="merchant-settings-title">{group.title}</h3>
          <div className="panel-card merchant-settings-panel">
            {group.rows.map(({ id, label, value, Icon }) => (
              <button
                key={id}
                type="button"
                className="merchant-settings-row"
                onClick={() => onEditSection(id)}
              >
                <div className="profile-row-icon">
                  <Icon size={18} strokeWidth={2.2} />
                </div>
                <div className="profile-row-copy">
                  <div className="profile-row-label">{label}</div>
                  <div className="profile-row-value profile-row-value--soft">
                    {typeof value === "function" ? value(editBranch) : value}
                  </div>
                </div>
                <ChevronRight size={16} strokeWidth={2.2} className="profile-row-arrow" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {onLogout && (
        <button type="button" className="profile-logout" onClick={onLogout}>
          <LogOut size={17} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          Log out
        </button>
      )}

      {onDeleteAccount && (
        <button type="button" className="profile-delete" onClick={onDeleteAccount}>
          Delete account
        </button>
      )}
    </div>
  );
}
