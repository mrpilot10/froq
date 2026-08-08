"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  deleteMenuOffer,
  saveMenuOffer,
} from "@/app/merchant/menu-offers-actions";
import {
  OFFER_BADGE_MAX,
  OFFER_DETAIL_MAX,
  OFFER_TITLE_MAX,
  type MenuOffer,
} from "@/lib/menu/offers";

interface MenuOfferSheetProps {
  open: boolean;
  offer: MenuOffer | null;
  onClose: () => void;
  onSaved: () => void;
}

export function MenuOfferSheet({
  open,
  offer,
  onClose,
  onSaved,
}: MenuOfferSheetProps) {
  const [badge, setBadge] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBadge(offer?.badge ?? "");
    setTitle(offer?.title ?? "");
    setDetail(offer?.detail ?? "");
    setSaving(false);
    setRemoving(false);
  }, [open, offer]);

  const busy = saving || removing;

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveMenuOffer({
        id: offer?.id,
        badge,
        title,
        detail,
        isActive: true,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't save offer.");
        return;
      }
      toast.success(offer ? "Offer updated." : "Offer added.");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!offer) return;
    setRemoving(true);
    try {
      const result = await deleteMenuOffer(offer.id);
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't delete offer.");
        return;
      }
      toast.success("Offer deleted.");
      onSaved();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={busy ? () => {} : onClose}
      labelledBy="menu-offer-title"
      className="merchant-theme merchant-edit-drawer"
    >
      <div className="merchant-edit-sheet">
        <div className="merchant-edit-sheet-head">
          <h3 id="menu-offer-title" className="merchant-edit-sheet-title">
            {offer ? "Edit offer" : "Add offer"}
          </h3>
          <p className="merchant-edit-sheet-sub">
            Shown on the guest menu when they tap Offers.
          </p>
        </div>

        <div className="merchant-edit-fields">
          <label className="auth-field">
            <span className="merchant-field-head">
              <span className="auth-label">Badge</span>
              <span className="merchant-char-count">
                {badge.length}/{OFFER_BADGE_MAX}
              </span>
            </span>
            <input
              className="auth-input"
              type="text"
              maxLength={OFFER_BADGE_MAX}
              placeholder="e.g. 20% OFF"
              value={badge}
              onChange={(event) => setBadge(event.target.value.slice(0, OFFER_BADGE_MAX))}
              autoFocus={!offer}
            />
          </label>

          <label className="auth-field">
            <span className="merchant-field-head">
              <span className="auth-label">Title</span>
              <span className="merchant-char-count">
                {title.length}/{OFFER_TITLE_MAX}
              </span>
            </span>
            <input
              className="auth-input"
              type="text"
              maxLength={OFFER_TITLE_MAX}
              placeholder="e.g. Weekday lunch"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, OFFER_TITLE_MAX))}
            />
          </label>

          <label className="auth-field">
            <span className="merchant-field-head">
              <span className="auth-label">Details</span>
              <span className="merchant-char-count">
                {detail.length}/{OFFER_DETAIL_MAX}
              </span>
            </span>
            <textarea
              className="auth-input"
              rows={3}
              maxLength={OFFER_DETAIL_MAX}
              placeholder="e.g. Mon–Thu, 12–3pm on all mains"
              value={detail}
              onChange={(event) => setDetail(event.target.value.slice(0, OFFER_DETAIL_MAX))}
            />
          </label>

          <div className="menu-item-actions">
            <button
              type="button"
              className="cta-btn merchant-cta-accent"
              disabled={busy}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : offer ? "Save offer" : "Add offer"}
            </button>

            {offer ? (
              <button
                type="button"
                className="menu-danger-btn"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 size={15} strokeWidth={2.2} />
                {removing ? "Removing…" : "Delete offer"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
