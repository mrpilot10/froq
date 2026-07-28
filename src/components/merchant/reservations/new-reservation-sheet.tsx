"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarPlus, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  createReservation,
  fetchReservationFormConfig,
} from "@/app/merchant/reservation-actions";
import {
  DEFAULT_RESERVATION_SETTINGS,
  reservationToday,
} from "@/lib/merchant/reservations";
import { useMerchantWorkspace } from "../merchant-workspace-context";
import { ReservationSlotPicker } from "./reservation-slot-picker";

interface NewReservationSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called after a booking is stored, so the list behind the sheet refreshes. */
  onSaved?: () => void;
}

/**
 * Bookings the merchant takes themselves (phone, walk-up). These are confirmed
 * on the spot, so the guest gets a WhatsApp confirmation right away.
 */
export function NewReservationSheet({ open, onClose, onSaved }: NewReservationSheetProps) {
  const { activeBranchId } = useMerchantWorkspace();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(() => reservationToday());
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [maxPartySize, setMaxPartySize] = useState(
    DEFAULT_RESERVATION_SETTINGS.maxPartySize,
  );
  const [allowNotes, setAllowNotes] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Slots come from the merchant's booking window, which they can change in
  // settings, so they're read each time the sheet opens rather than once.
  useEffect(() => {
    if (!open) return;
    void fetchReservationFormConfig().then((config) => {
      if (!config.ok) return;
      setSlots(config.slots ?? []);
      if (config.maxPartySize) setMaxPartySize(config.maxPartySize);
      setAllowNotes(config.allowNotes !== false);
      setTime((prev) => prev || config.slots?.[0] || "");
    });
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter the customer's name.");
      return;
    }
    if (phone.replace(/\D/g, "").length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (!time) {
      setError("Pick a time.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const result = await createReservation({
        name: name.trim(),
        phone,
        partySize,
        date,
        time,
        notes: notes.trim() || undefined,
        branchId: activeBranchId,
      });
      if (!result.ok || !result.reservation) {
        setError(result.error ?? "Couldn't save the reservation.");
        return;
      }
      toast.success(`Reservation saved for ${result.reservation.customerName}`);
      setName("");
      setPhone("");
      setNotes("");
      setPartySize(2);
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="new-reservation-title"
      className="merchant-theme merchant-edit-drawer"
    >
      <div className="merchant-edit-sheet">
        <div className="merchant-edit-sheet-head">
          <h3 id="new-reservation-title" className="merchant-edit-sheet-title">
            New booking
          </h3>
          <p className="merchant-edit-sheet-sub">
            Add a booking you took by phone — the guest gets a WhatsApp confirmation
          </p>
        </div>

        <form className="merchant-edit-fields" onSubmit={submit}>
          <label className="auth-field">
            <span className="auth-label">Customer name</span>
            <input
              className="auth-input"
              type="text"
              placeholder="e.g. Rahul Verma"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Phone</span>
            <div className="auth-phone-row">
              <span className="auth-phone-prefix">+91</span>
              <input
                className="auth-input auth-input-phone"
                type="tel"
                inputMode="numeric"
                placeholder="98765 43210"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value.replace(/\D/g, "").slice(0, 10));
                  setError("");
                }}
              />
            </div>
          </label>

          <div className="queue-party-row">
            <div className="queue-party-copy">
              <span className="queue-party-label">Guests</span>
              <span className="queue-party-hint">Up to {maxPartySize} per booking</span>
            </div>
            <div className="queue-stepper">
              <button
                type="button"
                className="queue-stepper-btn"
                aria-label="Fewer guests"
                onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                disabled={partySize <= 1}
              >
                <Minus size={16} strokeWidth={2.4} />
              </button>
              <span className="queue-stepper-value">{partySize}</span>
              <button
                type="button"
                className="queue-stepper-btn"
                aria-label="More guests"
                onClick={() => setPartySize((n) => Math.min(maxPartySize, n + 1))}
                disabled={partySize >= maxPartySize}
              >
                <Plus size={16} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          <ReservationSlotPicker
            slots={slots}
            date={date}
            time={time}
            minDate={reservationToday()}
            onDateChange={(next) => {
              setDate(next);
              setError("");
            }}
            onTimeChange={(next) => {
              setTime(next);
              setError("");
            }}
          />

          {allowNotes ? (
            <label className="auth-field">
              <span className="auth-label">Notes (optional)</span>
              <textarea
                className="auth-input merchant-textarea"
                rows={2}
                placeholder="Window table, anniversary…"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          ) : null}

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="cta-btn merchant-cta-accent" disabled={saving}>
            <CalendarPlus size={17} strokeWidth={2.4} />
            {saving ? "Saving…" : "Save reservation"}
          </button>
        </form>
      </div>
    </BottomSheet>
  );
}
