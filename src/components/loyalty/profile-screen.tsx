import { ChevronRight, LogOut, Mail, MapPin, Phone, Store } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/auth/format";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { TabPageShell } from "./tab-page-shell";

interface ProfileScreenProps {
  business: BusinessInfo;
  name: string;
  initials: string;
  phone: string;
  email?: string;
  filled: number;
  memberSince: string;
  onLogout: () => void;
}

export function ProfileScreen({
  business,
  name,
  initials,
  phone,
  email,
  filled,
  memberSince,
  onLogout,
}: ProfileScreenProps) {
  return (
    <TabPageShell
      title="Profile"
      subtitle={`Your account at ${business.shortName}`}
    >
      <div className="panel-card profile-panel">
        <div className="profile-hero">
          <div className="profile-avatar">{initials}</div>
          <div>
            <h3 className="profile-name">{name}</h3>
            <p className="profile-meta">
              {filled} stamp{filled === 1 ? "" : "s"} collected · Member since {memberSince}
            </p>
          </div>
        </div>

        <div className="profile-divider" />

        <div className="profile-row">
          <div className="profile-row-icon">
            <Phone size={18} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </div>
          <div className="profile-row-copy">
            <div className="profile-row-label">Mobile</div>
            <div className="profile-row-value">{formatPhoneDisplay(phone)}</div>
          </div>
        </div>

        {email && (
          <div className="profile-row">
            <div className="profile-row-icon">
              <Mail size={18} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </div>
            <div className="profile-row-copy">
              <div className="profile-row-label">Email</div>
              <div className="profile-row-value">{email}</div>
            </div>
          </div>
        )}

        <div className="profile-row">
          <div className="profile-row-icon">
            <Store size={18} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </div>
          <div className="profile-row-copy">
            <div className="profile-row-label">Store</div>
            <div className="profile-row-value">{business.name}</div>
          </div>
          <ChevronRight size={16} strokeWidth={2.2} className="profile-row-arrow" aria-hidden />
        </div>

        <div className="profile-row">
          <div className="profile-row-icon">
            <MapPin size={18} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </div>
          <div className="profile-row-copy">
            <div className="profile-row-label">Address</div>
            <div className="profile-row-value profile-row-value--soft">{business.address}</div>
          </div>
        </div>
      </div>

      <button type="button" className="profile-logout" onClick={onLogout}>
        <LogOut size={17} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        Log out
      </button>
    </TabPageShell>
  );
}
