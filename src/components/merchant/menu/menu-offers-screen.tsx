"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Tag } from "lucide-react";
import { fetchMenuOffers } from "@/app/merchant/menu-offers-actions";
import { canEditMenu } from "@/lib/merchant/roles";
import type { MenuOffer } from "@/lib/menu/offers";
import { useMerchantWorkspace } from "../merchant-workspace-context";
import { MenuOfferSheet } from "./menu-offer-sheet";
import { MenuOffersSkeleton } from "./menu-skeletons";

/**
 * Table offers for the guest AI Menu sheet — add, edit, show/hide.
 */
export function MenuOffersScreen() {
  const { role, profile } = useMerchantWorkspace();
  const canEdit = canEditMenu(role);
  const accent = profile.brandColor?.trim() || "#0C1A14";

  const [offers, setOffers] = useState<MenuOffer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MenuOffer | null>(null);

  const load = useCallback(async () => {
    const result = await fetchMenuOffers();
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't load offers.");
      setOffers([]);
      setLoaded(true);
      return;
    }
    setOffers(result.offers);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchMenuOffers();
      if (cancelled) return;
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't load offers.");
        setOffers([]);
        setLoaded(true);
        return;
      }
      setOffers(result.offers);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (offer: MenuOffer) => {
    setEditing(offer);
    setSheetOpen(true);
  };

  return (
    <div className="tab-screen">
      <div className="tab-head menu-tab-head">
        <div>
          <h2 className="tab-title">Offers</h2>
          <p className="tab-sub">
            Promos guests see when they tap Offers on the AI menu
          </p>
        </div>
        {canEdit ? (
          <div className="menu-head-actions">
            <button
              type="button"
              className="menu-toolbar-btn is-primary"
              onClick={openAdd}
            >
              <Plus size={16} strokeWidth={2.4} />
              Add offer
            </button>
          </div>
        ) : null}
      </div>

      {!loaded ? (
        <MenuOffersSkeleton />
      ) : offers.length === 0 ? (
        <div className="panel-card merchant-empty">
          <div className="profile-row-icon" style={{ margin: "0 auto 12px" }}>
            <Tag size={20} strokeWidth={2.1} />
          </div>
          <p className="merchant-empty-title">No offers yet</p>
          <p className="merchant-empty-copy">
            {canEdit
              ? "Add a weekday special, combo deal, or dessert add-on for the guest menu."
              : "When the kitchen adds offers, they’ll show up here."}
          </p>
          {canEdit ? (
            <div className="menu-empty-actions">
              <button
                type="button"
                className="menu-toolbar-btn is-primary"
                onClick={openAdd}
              >
                <Plus size={16} strokeWidth={2.4} />
                Add offer
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">At the table</h3>
            <span className="merchant-section-meta">
              {offers.length} offer{offers.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="panel-card menu-group">
            <ul className="menu-dish-list">
              {offers.map((offer) => (
                <li key={offer.id}>
                  <div className="menu-dish">
                    <button
                      type="button"
                      className="menu-dish-main"
                      onClick={() => {
                        if (canEdit) openEdit(offer);
                      }}
                    >
                      <span
                        className="menu-dish-thumb"
                        aria-hidden="true"
                        style={{
                          background: accent,
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: "-0.2px",
                          lineHeight: 1.15,
                          textAlign: "center",
                          padding: 6,
                        }}
                      >
                        {offer.badge}
                      </span>
                      <span className="menu-dish-copy">
                        <span className="menu-dish-name">{offer.title}</span>
                        {offer.detail ? (
                          <span className="menu-dish-desc">{offer.detail}</span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {canEdit ? (
              <button
                type="button"
                className="menu-add-row"
                onClick={openAdd}
              >
                <Plus size={15} strokeWidth={2.4} />
                Add offer
              </button>
            ) : null}
          </div>
        </section>
      )}

      {canEdit ? (
        <MenuOfferSheet
          open={sheetOpen}
          offer={editing}
          onClose={() => setSheetOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
