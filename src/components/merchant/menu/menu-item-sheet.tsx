"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  aiDescribeDish,
  aiDishThumbnail,
  deleteMenuItem,
  saveMenuItem,
} from "@/app/merchant/menu-actions";
import {
  ALLERGEN_LABELS,
  ALLERGENS,
  DIET_LABELS,
  DIET_TAGS,
  MENU_DESC_MAX,
  MENU_NAME_MAX,
  MENU_SECTION_MAX,
  SPICE_LABELS,
  toggleAllergen,
  toggleDietTag,
  type Allergen,
  type DietTag,
  type MenuCategory,
  type MenuItem,
  type MenuItemStatus,
} from "@/lib/menu/types";
import { compressDishDataUrl, prepareDishThumbnail } from "@/lib/menu/upload";
import { creditButtonSuffix } from "@/lib/ai/credits-config";
import { DietIcon, SpiceIcons } from "./menu-diet-icons";
import { AiPending } from "./menu-ai-field";

interface MenuItemSheetProps {
  open: boolean;
  /** Null when adding. */
  item: MenuItem | null;
  categories: MenuCategory[];
  /** Pre-fills the section when adding from inside one. */
  defaultCategoryName?: string;
  onClose: () => void;
  onSaved: () => void;
}

type AiBusy = "desc" | "img" | null;

/** Sentinel option that swaps the section dropdown for a free-text field. */
const NEW_CATEGORY = "__new_section__";

export function MenuItemSheet({
  open,
  item,
  categories,
  defaultCategoryName,
  onClose,
  onSaved,
}: MenuItemSheetProps) {
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const categoryNames = useMemo(
    () => categories.map((category) => category.name),
    [categories],
  );

  const [categoryName, setCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [diet, setDiet] = useState<DietTag[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [spiceLevel, setSpiceLevel] = useState<number | null>(null);
  const [prepMinutes, setPrepMinutes] = useState<number | null>(null);
  const [calories, setCalories] = useState<number | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [status, setStatus] = useState<MenuItemStatus>("live");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiBusy>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [baseline, setBaseline] = useState<{
    categoryName: string;
    name: string;
    description: string;
    price: string;
    imageUrl: string | null;
    diet: DietTag[];
    allergens: Allergen[];
    spiceLevel: number | null;
    prepMinutes: number | null;
    calories: number | null;
    isAvailable: boolean;
    status: MenuItemStatus;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const currentCategory = item
      ? categories.find((category) => category.id === item.categoryId)?.name
      : undefined;
    const nextCategory =
      currentCategory ?? defaultCategoryName ?? categoryNames[0] ?? "";
    // The very first dish has nothing to pick from, so go straight to typing.
    setAddingCategory(categoryNames.length === 0);
    setCategoryName(nextCategory);
    setName(item?.name ?? "");
    setDescription(item?.description ?? "");
    setPrice(item?.price == null ? "" : String(item.price));
    setImageUrl(item?.imageUrl ?? null);
    setDiet(item?.diet ?? []);
    setAllergens(item?.allergens ?? []);
    setSpiceLevel(item?.spiceLevel ?? null);
    setPrepMinutes(item?.prepMinutes ?? null);
    setCalories(item?.calories ?? null);
    setIsAvailable(item?.isAvailable ?? true);
    setStatus(item?.status ?? "live");
    setSaving(false);
    setRemoving(false);
    setAiBusy(null);
    setLeaveConfirm(false);
    setBaseline({
      categoryName: nextCategory,
      name: item?.name ?? "",
      description: item?.description ?? "",
      price: item?.price == null ? "" : String(item.price),
      imageUrl: item?.imageUrl ?? null,
      diet: item?.diet ?? [],
      allergens: item?.allergens ?? [],
      spiceLevel: item?.spiceLevel ?? null,
      prepMinutes: item?.prepMinutes ?? null,
      calories: item?.calories ?? null,
      isAvailable: item?.isAvailable ?? true,
      status: item?.status ?? "live",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const isDirty = useMemo(() => {
    if (!baseline) {
      return Boolean(
        name.trim() ||
          description.trim() ||
          imageUrl ||
          price.trim() ||
          prepMinutes != null ||
          calories != null,
      );
    }
    const sameList = <T,>(a: T[], b: T[]) =>
      a.length === b.length && a.every((value, index) => value === b[index]);
    return (
      categoryName !== baseline.categoryName ||
      name !== baseline.name ||
      description !== baseline.description ||
      price !== baseline.price ||
      imageUrl !== baseline.imageUrl ||
      !sameList(diet, baseline.diet) ||
      !sameList(allergens, baseline.allergens) ||
      spiceLevel !== baseline.spiceLevel ||
      prepMinutes !== baseline.prepMinutes ||
      calories !== baseline.calories ||
      isAvailable !== baseline.isAvailable ||
      status !== baseline.status
    );
  }, [
    baseline,
    categoryName,
    name,
    description,
    price,
    imageUrl,
    diet,
    allergens,
    spiceLevel,
    prepMinutes,
    calories,
    isAvailable,
    status,
  ]);

  const applyAiPhoto = async (dishName: string, dishDesc: string): Promise<string | null> => {
    const result = await aiDishThumbnail({ name: dishName, description: dishDesc });
    if (!result.ok || !result.imageUrl) {
      throw new Error(result.error ?? "Couldn't generate a photo.");
    }
    try {
      return await compressDishDataUrl(result.imageUrl);
    } catch {
      return result.imageUrl;
    }
  };

  const save = async (nextStatus: MenuItemStatus = status) => {
    if (!name.trim()) {
      toast.error("Give the dish a name.");
      return;
    }
    const section = categoryName.trim().slice(0, MENU_SECTION_MAX);
    if (addingCategory && !section && categoryNames.length > 0) {
      toast.error("Name the new section.");
      return;
    }
    setLeaveConfirm(false);
    setSaving(true);
    try {
      const parsed = Number(price.replace(/[^0-9.]/g, ""));
      const result = await saveMenuItem({
        id: item?.id,
        categoryName: section || "Menu",
        name: name.slice(0, MENU_NAME_MAX),
        description: description.slice(0, MENU_DESC_MAX),
        price: price.trim() === "" || !Number.isFinite(parsed) ? null : parsed,
        imageUrl,
        diet,
        allergens,
        spiceLevel,
        prepMinutes,
        calories,
        isAvailable: nextStatus === "draft" ? false : isAvailable,
        status: nextStatus,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't save the dish.");
        return;
      }
      toast.success(
        nextStatus === "draft"
          ? "Draft saved"
          : item
            ? "Dish updated"
            : "Dish added",
      );
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || removing || Boolean(aiBusy);

  const requestClose = () => {
    if (busy) return;
    if (isDirty) {
      setLeaveConfirm(true);
      return;
    }
    onClose();
  };

  const remove = async () => {
    if (!item) return;
    setRemoving(true);
    try {
      const result = await deleteMenuItem({ id: item.id });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't remove the dish.");
        return;
      }
      toast.success("Dish removed");
      onSaved();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  const describe = async () => {
    if (!name.trim()) {
      toast.error("Give the dish a name first.");
      return;
    }
    setAiBusy("desc");
    try {
      const result = await aiDescribeDish({
        name,
        section: categoryName,
        existing: description,
      });
      if (!result.ok || !result.description) {
        toast.error(result.error ?? "Couldn't write a description.");
        return;
      }
      setDescription(result.description);
      if (result.prepMinutes != null) setPrepMinutes(result.prepMinutes);
      if (result.calories != null) setCalories(result.calories);
      if (result.spiceLevel != null) setSpiceLevel(result.spiceLevel);
      // AI only tags high-confidence contains; still let the merchant edit chips.
      if (result.allergens) setAllergens(result.allergens);
    } finally {
      setAiBusy(null);
    }
  };

  const generateThumb = async () => {
    if (!name.trim()) {
      toast.error("Give the dish a name first.");
      return;
    }
    setAiBusy("img");
    try {
      const next = await applyAiPhoto(name, description);
      if (!next) {
        toast.error("Couldn't generate a photo.");
        return;
      }
      setImageUrl(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate a photo.");
    } finally {
      setAiBusy(null);
    }
  };

  const uploadThumb = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImageUrl(await prepareDishThumbnail(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't use that photo.");
    }
  };

  const canAi = name.trim().length > 0;

  return (
    <BottomSheet
      open={open}
      onClose={requestClose}
      labelledBy="menu-item-title"
      className="merchant-theme merchant-edit-drawer"
    >
      <div className="merchant-edit-sheet">
        <div className="merchant-edit-sheet-head">
          <h3 id="menu-item-title" className="merchant-edit-sheet-title">
            {item ? "Edit dish" : "Add a dish"}
          </h3>
          <p className="merchant-edit-sheet-sub">
            Start with the name — AI uses it for descriptions and photos.
          </p>
        </div>

        <div className="merchant-edit-fields menu-item-form">
          <label className="auth-field">
            <span className="merchant-field-head">
              <span className="auth-label">Dish name</span>
              <span className="merchant-char-count">
                {name.length}/{MENU_NAME_MAX}
              </span>
            </span>
            <input
              className="auth-input"
              type="text"
              maxLength={MENU_NAME_MAX}
              placeholder="e.g. Paneer Tikka"
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, MENU_NAME_MAX))}
              autoFocus={!item}
            />
          </label>

          <div className="menu-field-row">
            <div className="auth-field">
              <span className="auth-label">Section</span>
              {categoryNames.length > 0 ? (
                <select
                  className="auth-input auth-select"
                  aria-label="Section"
                  value={addingCategory ? NEW_CATEGORY : categoryName}
                  onChange={(event) => {
                    const next = event.target.value;
                    setAddingCategory(next === NEW_CATEGORY);
                    setCategoryName(next === NEW_CATEGORY ? "" : next);
                  }}
                >
                  {categoryNames.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY}>+ New section…</option>
                </select>
              ) : null}
              {addingCategory ? (
                <input
                  className="auth-input"
                  type="text"
                  maxLength={MENU_SECTION_MAX}
                  placeholder="e.g. Starters"
                  aria-label="New section name"
                  autoFocus={categoryNames.length > 0}
                  value={categoryName}
                  onChange={(event) =>
                    setCategoryName(event.target.value.slice(0, MENU_SECTION_MAX))
                  }
                />
              ) : null}
            </div>

            <label className="auth-field">
              <span className="auth-label">Price</span>
              <input
                className="auth-input"
                type="text"
                inputMode="decimal"
                placeholder="—"
                value={price}
                onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, ""))}
              />
            </label>
          </div>

          <div className="menu-item-block">
            <div className="menu-item-desc-head">
              <span className="merchant-field-head">
                <span className="auth-label">Description</span>
                <span className="merchant-char-count">
                  {description.length}/{MENU_DESC_MAX}
                </span>
              </span>
              <button
                type="button"
                className="menu-ai-chip"
                disabled={busy || !canAi}
                title={canAi ? undefined : "Add a dish name first"}
                onClick={() => void describe()}
              >
                {aiBusy === "desc" ? (
                  <Loader2 size={12} strokeWidth={2.4} className="menu-spin" />
                ) : (
                  <Sparkles size={12} strokeWidth={2.4} />
                )}
                {aiBusy === "desc"
                  ? "Writing…"
                  : description.trim()
                    ? `Rewrite ${creditButtonSuffix("rewrite_description")}`
                    : `AI write ${creditButtonSuffix("menu_description")}`}
              </button>
            </div>
            <label className="auth-field">
              <AiPending
                busy={aiBusy === "desc"}
                variant="top"
                label="Writing the description"
              >
                <textarea
                  className="auth-input menu-textarea"
                  rows={3}
                  maxLength={MENU_DESC_MAX}
                  placeholder={
                    canAi
                      ? "e.g. Paneer cubes with capsicum and onion in a tomato gravy"
                      : "Add a dish name first, then use AI write"
                  }
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value.slice(0, MENU_DESC_MAX))
                  }
                />
              </AiPending>
            </label>
            <div className="menu-item-desc-tools">
              <label className="menu-item-cook">
                <span className="menu-item-cook-label">Cook time</span>
                <AiPending busy={aiBusy === "desc"} label="Estimating cook time">
                  <span className="menu-item-cook-control">
                    <input
                      className="menu-item-cook-input"
                      inputMode="numeric"
                      placeholder="—"
                      value={prepMinutes == null ? "" : String(prepMinutes)}
                      onChange={(event) => {
                        const raw = event.target.value.replace(/[^0-9]/g, "");
                        setPrepMinutes(raw === "" ? null : Math.min(180, Number(raw)));
                      }}
                    />
                    <span>min</span>
                  </span>
                </AiPending>
              </label>
              <label className="menu-item-cook">
                <span className="menu-item-cook-label">Calories</span>
                <AiPending busy={aiBusy === "desc"} label="Estimating calories">
                  <span className="menu-item-cook-control">
                    <input
                      className="menu-item-cook-input menu-item-cook-input--wide"
                      inputMode="numeric"
                      placeholder="—"
                      value={calories == null ? "" : String(calories)}
                      onChange={(event) => {
                        const raw = event.target.value.replace(/[^0-9]/g, "");
                        setCalories(raw === "" ? null : Math.min(5000, Number(raw)));
                      }}
                    />
                    <span>kcal</span>
                  </span>
                </AiPending>
              </label>
            </div>
          </div>

          <div className="menu-item-media">
            <button
              type="button"
              className="menu-item-thumb-btn"
              disabled={busy}
              onClick={() => thumbInputRef.current?.click()}
              aria-label="Upload dish photo"
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" />
              ) : (
                <span className="menu-item-thumb-empty">
                  {aiBusy === "img" ? (
                    <Loader2 size={20} strokeWidth={2.2} className="menu-spin" />
                  ) : (
                    <ImagePlus size={20} strokeWidth={2.2} />
                  )}
                  <span>Add photo</span>
                </span>
              )}
            </button>
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                void uploadThumb(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="menu-item-media-copy">
              <p className="menu-item-media-title">Dish photo</p>
              <p className="menu-item-media-sub">
                {canAi
                  ? "Upload a square crop, or generate from the dish name."
                  : "Add a dish name first to generate with AI."}
              </p>
              <div className="menu-item-media-actions">
                <button
                  type="button"
                  className="menu-ai-chip"
                  disabled={busy || !canAi}
                  title={canAi ? undefined : "Add a dish name first"}
                  onClick={() => void generateThumb()}
                >
                  {aiBusy === "img" ? (
                    <Loader2 size={12} strokeWidth={2.4} className="menu-spin" />
                  ) : (
                    <Sparkles size={12} strokeWidth={2.4} />
                  )}
                  {aiBusy === "img"
                    ? "Generating…"
                    : imageUrl
                      ? `Regenerate ${creditButtonSuffix("dish_image_regenerate")}`
                      : `AI photo ${creditButtonSuffix("dish_image")}`}
                </button>
                {imageUrl ? (
                  <button
                    type="button"
                    className="menu-ai-chip menu-ai-chip--muted"
                    disabled={busy}
                    onClick={() => setImageUrl(null)}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="menu-item-block">
            <span className="auth-label">Tags</span>
            <div className="menu-chip-row">
              {DIET_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`menu-chip menu-tag-chip--${tag}${
                    diet.includes(tag) ? " is-on" : ""
                  }`}
                  aria-pressed={diet.includes(tag)}
                  onClick={() => setDiet(toggleDietTag(diet, tag))}
                >
                  <DietIcon tag={tag} size={12} />
                  {DIET_LABELS[tag]}
                </button>
              ))}
            </div>
          </div>

          <div className="menu-item-block">
            <span className="auth-label">Allergens</span>
            <AiPending
              busy={aiBusy === "desc"}
              variant="block"
              label="Tagging likely allergens"
            >
              <div className="menu-chip-row">
                {ALLERGENS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`menu-chip${allergens.includes(tag) ? " is-on" : ""}`}
                    aria-pressed={allergens.includes(tag)}
                    onClick={() => setAllergens(toggleAllergen(allergens, tag))}
                  >
                    {ALLERGEN_LABELS[tag]}
                  </button>
                ))}
              </div>
            </AiPending>
          </div>

          <div className="menu-item-block">
            <span className="auth-label">Spice</span>
            <AiPending
              busy={aiBusy === "desc"}
              variant="block"
              label="Judging how spicy the dish is"
            >
              <div className="menu-chip-row" role="group" aria-label="Spice level">
                {SPICE_LABELS.map((label, level) => (
                  <button
                    key={label}
                    type="button"
                    className={`menu-chip menu-tag-chip--spice${spiceLevel === level ? " is-on" : ""}`}
                    aria-pressed={spiceLevel === level}
                    onClick={() => setSpiceLevel(spiceLevel === level ? null : level)}
                  >
                    {level > 0 ? <SpiceIcons level={level} size={11} /> : null}
                    {label}
                  </button>
                ))}
              </div>
            </AiPending>
          </div>

          <label className="menu-toggle-row">
            <span className="menu-toggle-copy">
              <span className="menu-toggle-title">On the menu</span>
              <span className="menu-toggle-sub">
                Turn off when it&apos;s sold out — guests stop seeing it.
              </span>
            </span>
            <input
              type="checkbox"
              checked={isAvailable && status === "live"}
              disabled={status === "draft"}
              onChange={(event) => setIsAvailable(event.target.checked)}
            />
          </label>

          <div className="menu-item-actions">
            <button
              type="button"
              className="cta-btn merchant-cta-accent"
              disabled={busy}
              onClick={() => void save("live")}
            >
              {saving ? "Saving…" : item ? "Publish / save" : "Add dish"}
            </button>

            <button
              type="button"
              className="menu-secondary-btn"
              disabled={busy}
              onClick={() => void save("draft")}
            >
              Save as draft
            </button>

            {item ? (
              <button
                type="button"
                className="menu-danger-btn"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 size={15} strokeWidth={2.2} />
                {removing ? "Removing…" : "Remove dish"}
              </button>
            ) : null}
          </div>
        </div>

        {leaveConfirm ? (
          <div className="menu-leave-confirm" role="dialog" aria-labelledby="menu-item-leave-title">
            <p id="menu-item-leave-title" className="menu-leave-confirm-title">
              Save before closing?
            </p>
            <p className="menu-leave-confirm-text">
              Your changes aren&apos;t on the menu yet.
            </p>
            <div className="menu-leave-confirm-actions">
              <div className="menu-leave-confirm-save">
                <button
                  type="button"
                  className="cta-btn merchant-cta-accent"
                  disabled={busy}
                  onClick={() => void save("live")}
                >
                  {saving ? "Saving…" : item ? "Save" : "Add dish"}
                </button>
                <button
                  type="button"
                  className="menu-secondary-btn"
                  disabled={busy}
                  onClick={() => void save("draft")}
                >
                  Save as draft
                </button>
              </div>
              <div className="menu-leave-confirm-dismiss">
                <button
                  type="button"
                  className="menu-text-btn"
                  disabled={busy}
                  onClick={() => setLeaveConfirm(false)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="menu-text-btn menu-text-btn--danger"
                  disabled={busy}
                  onClick={() => {
                    setLeaveConfirm(false);
                    onClose();
                  }}
                >
                  Close without saving
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
