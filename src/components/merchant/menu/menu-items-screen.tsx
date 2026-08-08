"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpDown,
  BookOpen,
  CheckSquare,
  Eye,
  EyeOff,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Upload,
  X,
} from "lucide-react";
import { useMerchantWorkspace } from "../merchant-workspace-context";
import { useMenuSetup } from "./use-menu-setup";
import { MenuUploadSheet } from "./menu-upload-sheet";
import { MenuItemSheet } from "./menu-item-sheet";
import { DietIcon, DietIconRow, SpiceIcons } from "./menu-diet-icons";
import { setMenuItemsStatus } from "@/app/merchant/menu-actions";
import { canEditMenu } from "@/lib/merchant/roles";
import {
  DIET_LABELS,
  DIET_TAGS,
  formatMenuPrice,
  type DietTag,
  type MenuItem,
  type MenuItemStatus,
} from "@/lib/menu/types";
import {
  applyMenuFilters,
  countActiveFilters,
  countMenuItems,
  EMPTY_MENU_FILTERS,
  isMenuFiltered,
  MENU_FLAGS,
  MENU_SORTS,
  MENU_STATUS_FILTERS,
  toggleFacet,
  type MenuFilters,
  type MenuFlag,
  type MenuSort,
  type MenuStatusFilter,
} from "@/lib/menu/filter";
import { MenuItemsSkeleton } from "./menu-skeletons";

export function MenuItemsScreen() {
  const { activeBranchId, role } = useMerchantWorkspace();
  const { loading, categories, itemCount, refresh } = useMenuSetup(activeBranchId);
  const canEdit = canEditMenu(role);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [itemSheet, setItemSheet] = useState<{
    open: boolean;
    item: MenuItem | null;
    categoryName?: string;
  }>({ open: false, item: null });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState<"live" | "draft" | null>(null);
  const [filters, setFilters] = useState<MenuFilters>(EMPTY_MENU_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visibleCategories = useMemo(
    () => applyMenuFilters(categories, filters),
    [categories, filters],
  );
  const shownCount = useMemo(
    () => countMenuItems(visibleCategories),
    [visibleCategories],
  );
  const activeFilters = countActiveFilters(filters);
  const filtered = isMenuFiltered(filters);

  // Bulk actions work on what's on screen, so "filter, then select all" holds.
  const allIds = useMemo(
    () =>
      visibleCategories.flatMap((category) =>
        category.items.map((item) => item.id),
      ),
    [visibleCategories],
  );
  /**
   * Narrowing the filters can hide an already-ticked dish. Deriving the working
   * set from what's on screen keeps a bulk action from touching dishes the
   * merchant can no longer see.
   */
  const visibleSelected = useMemo(
    () => allIds.filter((id) => selected.has(id)),
    [allIds, selected],
  );
  const selectedCount = visibleSelected.length;
  const allSelected = allIds.length > 0 && selectedCount === allIds.length;

  const patchFilters = (patch: Partial<MenuFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const clearFilters = () =>
    setFilters((prev) => ({ ...EMPTY_MENU_FILTERS, sort: prev.sort }));

  const openAdd = (categoryName?: string) =>
    setItemSheet({ open: true, item: null, categoryName });
  const openEdit = (item: MenuItem) => setItemSheet({ open: true, item });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
    setBulkBusy(null);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const applyStatus = async (status: MenuItemStatus) => {
    const ids = visibleSelected;
    if (ids.length === 0) {
      toast.message("Pick at least one dish.");
      return;
    }
    setBulkBusy(status);
    try {
      const result = await setMenuItemsStatus({ ids, status });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't update those dishes.");
        return;
      }
      const n = result.updated ?? ids.length;
      toast.success(
        status === "live"
          ? `Published ${n} dish${n === 1 ? "" : "es"}`
          : `Moved ${n} dish${n === 1 ? "" : "es"} to draft`,
      );
      exitSelect();
      await refresh();
    } finally {
      setBulkBusy(null);
    }
  };

  return (
    <div className={`tab-screen${selecting ? " menu-selecting" : ""}`}>
      <div className="tab-head menu-tab-head">
        <div>
          <h2 className="tab-title">Menu</h2>
          <p className="tab-sub">The dishes and sections guests see when they scan</p>
        </div>
        {canEdit && itemCount > 0 ? (
          <div className="menu-head-actions">
            <button
              type="button"
              className="menu-toolbar-btn is-primary"
              onClick={() => openAdd()}
            >
              <Plus size={16} strokeWidth={2.4} />
              Add dish
            </button>
            <button
              type="button"
              className="menu-toolbar-btn"
              onClick={() => setUploadOpen(true)}
            >
              <Upload size={16} strokeWidth={2.2} />
              Upload menu
            </button>
          </div>
        ) : null}
      </div>

      {itemCount > 0 ? (
        <div className="menu-controls">
          <div className="menu-search">
            <Search size={16} strokeWidth={2.3} aria-hidden="true" />
            <input
              type="search"
              className="menu-search-input"
              placeholder="Search dishes, sections, ingredients"
              value={filters.query}
              onChange={(event) => patchFilters({ query: event.target.value })}
            />
            {filters.query ? (
              <button
                type="button"
                className="menu-search-clear"
                aria-label="Clear search"
                onClick={() => patchFilters({ query: "" })}
              >
                <X size={14} strokeWidth={2.6} />
              </button>
            ) : null}
          </div>

          <div className="menu-toolbar">
            {canEdit ? (
              selecting ? (
                <>
                  <button
                    type="button"
                    className="menu-toolbar-btn"
                    onClick={toggleSelectAll}
                  >
                    <CheckSquare size={16} strokeWidth={2.2} />
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                  <button
                    type="button"
                    className="menu-toolbar-btn"
                    disabled={bulkBusy !== null}
                    onClick={exitSelect}
                  >
                    <X size={16} strokeWidth={2.2} />
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="menu-toolbar-btn"
                  onClick={() => setSelecting(true)}
                >
                  <CheckSquare size={16} strokeWidth={2.2} />
                  Select
                </button>
              )
            ) : null}

            <button
              type="button"
              className={`menu-toolbar-btn${
                filtersOpen || activeFilters > 0 ? " is-active" : ""
              }`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={16} strokeWidth={2.2} />
              Filter
              {activeFilters > 0 ? (
                <span className="menu-toolbar-badge">{activeFilters}</span>
              ) : null}
            </button>

            <label className="menu-sort">
              <ArrowUpDown size={15} strokeWidth={2.2} aria-hidden="true" />
              <select
                className="menu-sort-select"
                aria-label="Sort dishes"
                value={filters.sort}
                onChange={(event) =>
                  patchFilters({ sort: event.target.value as MenuSort })
                }
              >
                {MENU_SORTS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <span className="menu-toolbar-count">
              {filtered
                ? `${shownCount} of ${itemCount} dishes`
                : `${itemCount} dish${itemCount === 1 ? "" : "es"} · ${
                    categories.length
                  } section${categories.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {filtersOpen ? (
            <div className="menu-filters">
              <div className="menu-filter-group">
                <span className="menu-filter-label">Status</span>
                <div className="menu-chip-row">
                  {MENU_STATUS_FILTERS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`menu-chip menu-chip--sm${
                        filters.status === option.key ? " is-on" : ""
                      }`}
                      aria-pressed={filters.status === option.key}
                      onClick={() =>
                        patchFilters({ status: option.key as MenuStatusFilter })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="menu-filter-group">
                <span className="menu-filter-label">Tags</span>
                <div className="menu-chip-row">
                  {DIET_TAGS.map((tag) => {
                    const on = filters.diet.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`menu-chip menu-chip--sm${on ? " is-on" : ""}`}
                        aria-pressed={on}
                        onClick={() =>
                          patchFilters({
                            diet: toggleFacet<DietTag>(filters.diet, tag),
                          })
                        }
                      >
                        <DietIcon tag={tag} size={12} />
                        {DIET_LABELS[tag]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="menu-filter-group">
                <span className="menu-filter-label">Needs work</span>
                <div className="menu-chip-row">
                  {MENU_FLAGS.map((flag) => {
                    const on = filters.flags.includes(flag.key);
                    return (
                      <button
                        key={flag.key}
                        type="button"
                        className={`menu-chip menu-chip--sm${on ? " is-on" : ""}`}
                        aria-pressed={on}
                        onClick={() =>
                          patchFilters({
                            flags: toggleFacet<MenuFlag>(filters.flags, flag.key),
                          })
                        }
                      >
                        {flag.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeFilters > 0 ? (
                <button
                  type="button"
                  className="menu-filter-reset"
                  onClick={clearFilters}
                >
                  <X size={14} strokeWidth={2.6} />
                  Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <MenuItemsSkeleton />
      ) : itemCount === 0 ? (
        <section className="merchant-section">
          <div className="panel-card merchant-empty">
            <div className="merchant-empty-icon" aria-hidden="true">
              <BookOpen size={26} strokeWidth={2} />
            </div>
            <p className="merchant-empty-title">No dishes yet</p>
            <p className="merchant-empty-sub">
              {canEdit
                ? "Upload photos of your menu or a PDF and AI reads the dishes and prices out of it. You review everything before it goes live."
                : "No dishes on this menu yet. Ask an owner or manager to upload or add them."}
            </p>
            {canEdit ? (
              <div className="menu-empty-actions">
                <button
                  type="button"
                  className="cta-btn merchant-cta-accent"
                  onClick={() => setUploadOpen(true)}
                >
                  <Sparkles size={16} strokeWidth={2.2} />
                  Upload menu
                </button>
                <button
                  type="button"
                  className="merchant-edit-cancel"
                  onClick={() => openAdd()}
                >
                  Add manually
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : visibleCategories.length === 0 ? (
        <section className="merchant-section">
          <div className="panel-card merchant-empty">
            <div className="merchant-empty-icon" aria-hidden="true">
              <SearchX size={26} strokeWidth={2} />
            </div>
            <p className="merchant-empty-title">No dishes match</p>
            <p className="merchant-empty-sub">
              {filters.query
                ? `Nothing matches “${filters.query.trim()}”. Try a shorter search or drop a filter.`
                : "Nothing matches these filters. Try dropping one."}
            </p>
            <div className="menu-empty-actions">
              <button
                type="button"
                className="merchant-edit-cancel"
                onClick={clearFilters}
              >
                Clear search and filters
              </button>
            </div>
          </div>
        </section>
      ) : (
        visibleCategories
          .filter((category) => category.items.length > 0)
          .map((category) => (
            <section key={category.id} className="merchant-section">
              <div className="merchant-section-head">
                <h3 className="merchant-section-label">{category.name}</h3>
                <span className="merchant-section-meta">
                  {category.items.length} dish{category.items.length === 1 ? "" : "es"}
                </span>
              </div>

              <div className="panel-card menu-group">
                <ul className="menu-dish-list">
                  {category.items.map((item) => {
                    const isOn = selected.has(item.id);
                    return (
                      <li key={item.id}>
                        <div
                          className={`menu-dish${item.isAvailable ? "" : " is-off"}${
                            isOn ? " is-selected" : ""
                          }${selecting ? " is-selectable" : ""}`}
                        >
                          {selecting ? (
                            <label className="menu-dish-check">
                              <input
                                type="checkbox"
                                checked={isOn}
                                onChange={() => toggleSelect(item.id)}
                                aria-label={`Select ${item.name}`}
                              />
                            </label>
                          ) : null}
                          <button
                            type="button"
                            className="menu-dish-main"
                            onClick={() => {
                              if (selecting) toggleSelect(item.id);
                              else if (canEdit) openEdit(item);
                            }}
                          >
                            <span className="menu-dish-thumb" aria-hidden="true">
                              {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.imageUrl} alt="" />
                              ) : (
                                <span className="menu-dish-thumb-fallback">
                                  {item.name.slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </span>
                            <span className="menu-dish-copy">
                              <span className="menu-dish-name">{item.name}</span>
                              {item.description ? (
                                <span className="menu-dish-desc">{item.description}</span>
                              ) : null}
                              <span className="menu-dish-foot">
                                <DietIconRow diet={item.diet} />
                                <SpiceIcons level={item.spiceLevel} />
                                {item.status === "draft" ? (
                                  <span className="menu-dish-pill menu-dish-pill--draft">
                                    Draft
                                  </span>
                                ) : null}
                                {item.isAvailable || item.status === "draft" ? null : (
                                  <span className="menu-dish-pill menu-dish-pill--muted">
                                    Sold out
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="menu-dish-stats">
                              <span className="menu-dish-price">
                                {formatMenuPrice(item.price)}
                              </span>
                              {item.prepMinutes != null ? (
                                <span className="menu-dish-time">
                                  <Timer size={12} strokeWidth={2.6} aria-hidden="true" />
                                  {item.prepMinutes} min
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {/* A filtered list is a partial view — adding into it would confuse. */}
                {!selecting && !filtered && canEdit ? (
                  <button
                    type="button"
                    className="menu-add-row"
                    onClick={() => openAdd(category.name)}
                  >
                    <Plus size={15} strokeWidth={2.4} />
                    Add to {category.name}
                  </button>
                ) : null}
              </div>
            </section>
          ))
      )}

      {canEdit && selecting ? (
        <div className="menu-bulk-bar" role="toolbar" aria-label="Bulk menu actions">
          <span className="menu-bulk-bar-count">
            {selectedCount} selected
          </span>
          <button
            type="button"
            className="menu-bulk-bar-btn"
            disabled={selectedCount === 0 || bulkBusy !== null}
            onClick={() => void applyStatus("draft")}
          >
            <EyeOff size={15} strokeWidth={2.3} />
            {bulkBusy === "draft" ? "Saving…" : "Make draft"}
          </button>
          <button
            type="button"
            className="menu-bulk-bar-btn is-primary"
            disabled={selectedCount === 0 || bulkBusy !== null}
            onClick={() => void applyStatus("live")}
          >
            <Eye size={15} strokeWidth={2.3} />
            {bulkBusy === "live" ? "Publishing…" : "Publish"}
          </button>
        </div>
      ) : null}

      {canEdit ? (
        <>
          <MenuUploadSheet
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            onSaved={() => void refresh()}
          />
          <MenuItemSheet
            open={itemSheet.open}
            item={itemSheet.item}
            categories={categories}
            defaultCategoryName={itemSheet.categoryName}
            onClose={() => setItemSheet({ open: false, item: null })}
            onSaved={() => void refresh()}
          />
        </>
      ) : null}
    </div>
  );
}
