import { Bell, ChevronRight, Gift, Link2, LogOut, Settings, Store } from "lucide-react";
import Image from "next/image";
import type { MerchantEditSection, MerchantProfile } from "@/lib/merchant/types";
import { MerchantPlanCard } from "./plan-card";
import { MerchantQrPanel } from "./qr-panel";

interface MerchantProfileScreenProps {
  profile: MerchantProfile;
  onEditSection: (section: MerchantEditSection) => void;
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
    title: "Loyalty program",
    items: [
      { id: "loyalty", label: "Rewards & stamps", value: "Offer, stamps & order value", Icon: Gift },
    ],
  },
  {
    title: "Notifications",
    items: [
      {
        id: "notifications",
        label: "Alerts & email",
        value: "Stamp, approval, marketing",
        Icon: Bell,
      },
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
  onEditSection,
  onLogout,
  onDeleteAccount,
}: MerchantProfileScreenProps) {
  const initials = profile.businessName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Profile</h2>
        <p className="tab-sub">Manage your business and settings</p>
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
            <p className="profile-meta">{profile.rewardTitle}</p>
          </div>
        </div>
      </div>

      <MerchantQrPanel profile={profile} />

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

      <MerchantPlanCard />

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
