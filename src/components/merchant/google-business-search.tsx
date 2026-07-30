"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";
import {
  PlacesSearchError,
  searchGooglePlaces,
  type GooglePlaceResult,
} from "@/lib/merchant/places";

export type GoogleBusinessSelection = {
  placeId: string;
  name: string;
  googleMapsUrl: string;
};

interface GoogleBusinessSearchProps {
  /** Currently saved / selected place (shown while editing). */
  selected?: GoogleBusinessSelection | null;
  onSelect: (place: GoogleBusinessSelection) => void;
  onClear?: () => void;
  /** Called after a list pick — onboarding uses this to advance. */
  onSelectedAndContinue?: (place: GoogleBusinessSelection) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function GoogleBusinessSearch({
  selected = null,
  onSelect,
  onClear,
  onSelectedAndContinue,
  placeholder = "Search for your business...",
  autoFocus = false,
}: GoogleBusinessSearchProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GooglePlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const requestIdRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
          const next = await searchGooglePlaces(trimmed);
          if (requestId !== requestIdRef.current) return;
          setResults(next);
          setOpen(true);
          if (next.length === 0) setError("No businesses found. Try a different search.");
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
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function pick(place: GooglePlaceResult) {
    const selection: GoogleBusinessSelection = {
      placeId: place.placeId,
      name: place.name,
      googleMapsUrl: place.googleMapsUrl,
    };
    onSelect(selection);
    setQuery("");
    setResults([]);
    setOpen(false);
    setError("");
    onSelectedAndContinue?.(selection);
  }

  return (
    <div className="google-place-search" ref={wrapRef}>
      {selected?.placeId ? (
        <div className="google-place-selected">
          <div className="google-place-selected-icon" aria-hidden="true">
            <Check size={16} strokeWidth={2.4} />
          </div>
          <div className="google-place-selected-copy">
            <div className="google-place-selected-name">{selected.name}</div>
            <div className="google-place-selected-meta">Linked to Google Business</div>
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

      <div className={`merchant-customer-search-field google-place-search-field${open ? " is-open" : ""}`}>
        <Search size={16} strokeWidth={2.2} className="google-place-search-icon" aria-hidden="true" />
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
          <Loader2 size={16} strokeWidth={2.2} className="google-place-search-spinner" aria-hidden="true" />
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
        Search starts after 3 characters. Pick your listing to link it.
      </span>
    </div>
  );
}
