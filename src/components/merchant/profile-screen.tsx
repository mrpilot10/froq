import { ChevronRight, Link2, LogOut, MapPin, Settings, Store, Users } from "lucide-react";
import Image from "next/image";
import type { MemberRole, MerchantEditSection, MerchantProfile } from "@/lib/merchant/types";

interface MerchantProfileScreenProps {
  profile: MerchantProfile;
  role: MemberRole;
  branchCount: number;
  memberCount: number;
  onEditSection: (section: MerchantEditSection) => void;
  onManageBranches: () => void;
  onManageTeam: () => void;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}

const SETTINGS_GROUPS: Array<{
  title: string;
  items: Array<{
    id: MerchantEditSection;
    label: string;
    value: string;
    Icon: typeof Store;
  }>;
}> = [
  {
    title: "Store",
    items: [
      { id: "business", label: "Store details", value: "Logo, color, name & address", Icon: Store },
      { id: "links", label: "Links & social", value: "Google, website & socials", Icon: Link2 },
    ],
  },
  {
    title: "Account",
    items: [
      { id: "account", label: "Account settings", value: "Email, phone, security", Icon: Settings },
    ],
  },
];

export function MerchantProfileScreen({
  profile,
  role,
  branchCount,
  memberCount,
  onEditSection,
  onManageBranches,
  onManageTeam,
  onLogout,
  onDeleteAccount,
}: MerchantProfileScreenProps) {
  const canManageBranches = role === "owner";
  const canManageTeam = role === "owner";
  const initials = profile.businessName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Business settings</h2>
        <p className="tab-sub">Manage your store identity and account</p>
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
            {(profile.ownerFirstName || profile.ownerLastName) && (
              <p className="profile-meta">
                {`${profile.ownerFirstName} ${profile.ownerLastName}`.trim()}
              </p>
            )}
            <p className="profile-meta">{profile.address || "Add your store address"}</p>
          </div>
        </div>
      </div>

      {(canManageBranches || canManageTeam) && (
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
            {canManageTeam && (
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

      {SETTINGS_GROUPS.map((group) => (
        <div key={group.title} className="merchant-settings-group">
          <h3 className="merchant-settings-title">{group.title}</h3>
          <div className="panel-card merchant-settings-panel">
            {group.items.map(({ id, label, value, Icon }) => (
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
                  <div className="profile-row-value profile-row-value--soft">{value}</div>
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
