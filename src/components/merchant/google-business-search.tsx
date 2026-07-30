"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";
import {
  PlacesSearchError,
  searchGooglePlaces,
  type GooglePlaceResult,
  type PlacesSearchLocation,
} from "@/lib/merchant/places";

export type GoogleBusinessSelection = {
  /** Empty when the merchant entered name + Maps link manually. */
  placeId: string;
  name: string;
  address: string;
  googleMapsUrl: string;
};

type EntryMode = "search" | "manual";

interface GoogleBusinessSearchProps {
  /** Currently saved / selected place (shown while editing). */
  selected?: GoogleBusinessSelection | null;
  onSelect: (place: GoogleBusinessSelection) => void;
  onClear?: () => void;
  /** Called after a list pick or manual save — onboarding uses this to advance. */
  onSelectedAndContinue?: (place: GoogleBusinessSelection) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

function normalizeMapsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isLikelyMapsUrl(raw: string): boolean {
  try {
    const url = new URL(normalizeMapsUrl(raw));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.toLowerCase();
    if (host === "maps.app.goo.gl" || host === "goo.gl" || host === "g.page") return true;
    if (host === "maps.google.com" || host === "maps.google.co.in") return true;
    if (host === "google.com" || host.endsWith(".google.com")) {
      return path.startsWith("/maps") || path.startsWith("/maps/") || host.startsWith("maps.");
    }
    return false;
  } catch {
    return false;
  }
}

function hasSelection(selected: GoogleBusinessSelection | null | undefined): boolean {
  if (!selected) return false;
  return Boolean(selected.placeId.trim() || (selected.name.trim() && selected.googleMapsUrl.trim()));
}

export function GoogleBusinessSearch({
  selected = null,
  onSelect,
  onClear,
  onSelectedAndContinue,
  placeholder = "Search business name or Google listing…",
  autoFocus = false,
}: GoogleBusinessSearchProps) {
  const listId = useId();
  const [mode, setMode] = useState<EntryMode>(() =>
    selected && !selected.placeId.trim() && selected.googleMapsUrl.trim() ? "manual" : "search",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GooglePlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<PlacesSearchLocation | null>(null);
  const [manualName, setManualName] = useState(selected?.name ?? "");
  const [manualMapsUrl, setManualMapsUrl] = useState(selected?.googleMapsUrl ?? "");
  const [manualError, setManualError] = useState("");
  const requestIdRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        /* India region/restriction on the worker still biases without device coords */
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  }, []);

  useEffect(() => {
    if (mode !== "search") return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await searchGooglePlaces(trimmed, location);
          if (requestId !== requestIdRef.current) return;
          setResults(next);
          setOpen(true);
          if (next.length === 0) {
            setError("No businesses found. Try adding your city, e.g. “Cafe Pune”.");
          }
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          setResults([]);
          setOpen(true);
          setError(
            err instanceof PlacesSearchError
              ? err.message
              : "Places search failed. Try again.",
          );
        } finally {
          if (requestId === requestIdRef.current) setLoading(false);
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, location, mode]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function applySelection(selection: GoogleBusinessSelection, advance: boolean) {
    onSelect(selection);
    setQuery("");
    setResults([]);
    setOpen(false);
    setError("");
    setManualError("");
    if (advance) onSelectedAndContinue?.(selection);
  }

  function pick(place: GooglePlaceResult) {
    applySelection(
      {
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        googleMapsUrl: place.googleMapsUrl,
      },
      true,
    );
  }

  function saveManual() {
    const name = manualName.trim();
    const googleMapsUrl = normalizeMapsUrl(manualMapsUrl);
    if (!name) {
      setManualError("Enter your business name.");
      return;
    }
    if (!googleMapsUrl) {
      setManualError("Paste your Google Maps link.");
      return;
    }
    if (!isLikelyMapsUrl(googleMapsUrl)) {
      setManualError("Use a Google Maps or Google Business link.");
      return;
    }
    applySelection(
      {
        placeId: "",
        name,
        address: selected?.address?.trim() || "",
        googleMapsUrl,
      },
      true,
    );
  }

  function switchMode(next: EntryMode) {
    setMode(next);
    setError("");
    setManualError("");
    setOpen(false);
    if (next === "manual") {
      setManualName(selected?.name ?? "");
      setManualMapsUrl(selected?.googleMapsUrl ?? "");
    }
  }

  const linked = hasSelection(selected);

  return (
    <div className="google-place-search" ref={wrapRef}>
      {linked && selected ? (
        <div className="google-place-selected">
          <div className="google-place-selected-icon" aria-hidden="true">
            <Check size={16} strokeWidth={2.4} />
          </div>
          <div className="google-place-selected-copy">
            <div className="google-place-selected-name">{selected.name}</div>
            <div className="google-place-selected-meta">
              {selected.address?.trim()
                ? selected.address
                : selected.placeId
                  ? "Linked to Google Business"
                  : "Saved with Google Maps link"}
            </div>
          </div>
          {onClear ? (
            <button
              type="button"
              className="google-place-selected-clear"
              onClick={onClear}
              aria-label="Clear Google Business"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="google-place-mode-toggle" role="tablist" aria-label="How to add your business">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "search"}
          className={`google-place-mode-btn${mode === "search" ? " is-active" : ""}`}
          onClick={() => switchMode("search")}
        >
          Search Google
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          className={`google-place-mode-btn${mode === "manual" ? " is-active" : ""}`}
          onClick={() => switchMode("manual")}
        >
          Enter manually
        </button>
      </div>

      {mode === "search" ? (
        <>
          <div
            className={`merchant-customer-search-field google-place-search-field${open ? " is-open" : ""}`}
          >
            <Search
              size={16}
              strokeWidth={2.2}
              className="google-place-search-icon"
              aria-hidden="true"
            />
            <input
              type="search"
              className="merchant-customer-search-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                if (results.length > 0 || error) setOpen(true);
              }}
              placeholder={placeholder}
              autoFocus={autoFocus}
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded={open}
            />
            {loading ? (
              <Loader2
                size={16}
                strokeWidth={2.2}
                className="google-place-search-spinner"
                aria-hidden="true"
              />
            ) : null}
          </div>

          {open && query.trim().length >= 3 ? (
            <div id={listId} className="google-place-results" role="listbox">
              {loading && results.length === 0 && !error ? (
                <div className="google-place-results-empty">Searching…</div>
              ) : null}
              {error ? (
                <div className="google-place-results-empty" role="alert">
                  {error}
                </div>
              ) : null}
              {!loading &&
                !error &&
                results.map((place) => (
                  <button
                    key={place.placeId}
                    type="button"
                    role="option"
                    className="google-place-result"
                    onClick={() => pick(place)}
                  >
                    <span className="google-place-result-icon" aria-hidden="true">
                      <MapPin size={16} strokeWidth={2.2} />
                    </span>
                    <span className="google-place-result-copy">
                      <span className="google-place-result-name">{place.name}</span>
                      {place.address ? (
                        <span className="google-place-result-address">{place.address}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
            </div>
          ) : null}

          <span className="merchant-field-hint">
            We’ll fill your business name and address from the listing you pick.
          </span>
        </>
      ) : (
        <div className="google-place-manual">
          <label className="auth-field">
            <span className="auth-label">Business name</span>
            <input
              className="auth-input"
              type="text"
              value={manualName}
              onChange={(e) => {
                setManualName(e.target.value);
                setManualError("");
              }}
              placeholder="Bloom Coffee Co."
              autoComplete="organization"
              autoFocus={autoFocus && mode === "manual"}
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">Google Maps link</span>
            <input
              className="auth-input"
              type="url"
              inputMode="url"
              value={manualMapsUrl}
              onChange={(e) => {
                setManualMapsUrl(e.target.value);
                setManualError("");
              }}
              placeholder="https://maps.app.goo.gl/…"
              autoComplete="off"
            />
          </label>
          {manualError ? (
            <p className="auth-error" role="alert">
              {manualError}
            </p>
          ) : null}
          <button type="button" className="cta-btn merchant-cta-accent" onClick={saveManual}>
            Save business
          </button>
          <span className="merchant-field-hint">
            Open your listing in Google Maps, tap Share, then paste the link here.
          </span>
        </div>
      )}
    </div>
  );
}
