"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Flame,
  ImagePlus,
  Loader2,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  aiDescribeDish,
  aiDishThumbnail,
  countMenuUsedForPlanMeter,
  readMenuUploads,
  saveMenuDraft,
} from "@/app/merchant/menu-actions";
import {
  ALLERGEN_LABELS,
  ALLERGENS,
  countDraftItems,
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
  type DraftMenuCategory,
  type DraftMenuItem,
  type MenuItemStatus,
} from "@/lib/menu/types";
import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_TOTAL_BYTES,
  MAX_UPLOAD_FILES,
  compressDishDataUrl,
  formatBytes,
  prepareDishThumbnail,
  prepareUpload,
  type PreparedUpload,
} from "@/lib/menu/upload";
import {
  AI_STEP_SEED_MS,
  MenuAiProgress,
  nextAvgMs,
  type AiProgressState,
} from "@/components/merchant/menu/menu-ai-progress";
import { DietIcon, SpiceIcons } from "./menu-diet-icons";
import { AiPending } from "./menu-ai-field";
import { AI_CREDIT_COSTS, creditButtonSuffix } from "@/lib/ai/credits-config";

type Stage = "pick" | "reading" | "review";

interface MenuUploadSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type BulkMode = "everything" | "photos" | "copy" | null;

/**
 * Upload → AI reads → merchant corrects with AI assist → save.
 * The review step is AI-first: one tap can fill copy, cook time, and photos.
 */
export function MenuUploadSheet({ open, onClose, onSaved }: MenuUploadSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [files, setFiles] = useState<PreparedUpload[]>([]);
  const [draft, setDraft] = useState<DraftMenuCategory[]>([]);
  const [saving, setSaving] = useState<"live" | "draft" | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState<BulkMode>(null);
  const [bulkProgress, setBulkProgress] = useState<AiProgressState | null>(null);
  const [readProgress, setReadProgress] = useState<AiProgressState | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  const draftCount = countDraftItems(draft);
  const needsBulkEverything = useMemo(() => {
    return draft.some((category) =>
      category.items.some(
        (item) =>
          Boolean(item.name.trim()) &&
          (!item.description.trim() || item.prepMinutes == null || !item.imageUrl),
      ),
    );
  }, [draft]);
  const needsBulkCopy = useMemo(() => {
    return draft.some((category) =>
      category.items.some(
        (item) =>
          Boolean(item.name.trim()) &&
          (!item.description.trim() || item.prepMinutes == null),
      ),
    );
  }, [draft]);
  const needsBulkPhotos = useMemo(() => {
    return draft.some((category) =>
      category.items.some((item) => Boolean(item.name.trim()) && !item.imageUrl),
    );
  }, [draft]);

  const bulkEverythingQuote = useMemo(() => {
    let items = 0;
    let needPhoto = 0;
    let needCopy = 0;
    for (const category of draft) {
      for (const item of category.items) {
        if (!item.name.trim()) continue;
        const photo = !item.imageUrl;
        const copy = !item.description.trim() || item.prepMinutes == null;
        if (!photo && !copy) continue;
        items += 1;
        if (photo) needPhoto += 1;
        if (copy) needCopy += 1;
      }
    }
    const imageCredits = needPhoto * AI_CREDIT_COSTS.dish_image;
    const descriptionCredits = needCopy * AI_CREDIT_COSTS.menu_description;
    return {
      items,
      imageCredits,
      descriptionCredits,
      totalCredits: imageCredits + descriptionCredits,
    };
  }, [draft]);

  useEffect(() => {
    if (open) return;
    for (const file of files) {
      if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
    }
    setStage("pick");
    setFiles([]);
    setDraft([]);
    setSaving(null);
    setBusyKey(null);
    setBulkMode(null);
    setBulkProgress(null);
    setReadProgress(null);
    setLeaveConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const room = MAX_UPLOAD_FILES - files.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_UPLOAD_FILES} files at a time.`);
      return;
    }

    const prepared: PreparedUpload[] = [];
    for (const file of Array.from(list).slice(0, room)) {
      try {
        prepared.push(await prepareUpload(file));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Couldn't read ${file.name}.`);
      }
    }
    if (prepared.length === 0) return;

    const next = [...files, ...prepared];
    const bytes = next.reduce((sum, file) => sum + file.bytes, 0);
    if (bytes > MAX_TOTAL_BYTES) {
      for (const file of prepared) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      }
      toast.error(
        `That's over ${formatBytes(MAX_TOTAL_BYTES)}. Read a few pages first, then add the rest.`,
      );
      return;
    }
    setFiles(next);
  };

  const removeFile = (index: number) => {
    const file = files[index];
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
    setFiles(files.filter((_, i) => i !== index));
  };

  const read = async () => {
    const startedAt = Date.now();
    setStage("reading");
    setReadProgress({
      done: 0,
      total: 1,
      label:
        files.length === 1
          ? "Reading file…"
          : `Reading ${files.length} files…`,
      startedAt,
      stepStartedAt: startedAt,
      avgMs: null,
      seedMs: AI_STEP_SEED_MS.readPage * Math.max(1, files.length),
      timed: true,
    });

    try {
      const result = await readMenuUploads({
        files: files.map((file) => ({
          name: file.name,
          mimeType: file.mimeType,
          data: file.data,
        })),
      });

      if (!result.ok) {
        toast.error(result.error ?? "Couldn't read that menu.");
        setStage("pick");
        return;
      }

      setDraft(result.categories);
      setStage("review");
      if (result.creditsUsed && result.dishCount) {
        toast.message(
          `${result.dishCount.toLocaleString("en-IN")} dish${
            result.dishCount === 1 ? "" : "es"
          } · ${result.creditsUsed.toLocaleString("en-IN")} credits used`,
        );
      }
    } finally {
      setReadProgress(null);
    }
  };

  const updateCategoryName = (index: number, name: string) => {
    setDraft(
      draft.map((category, i) =>
        i === index ? { ...category, name: name.slice(0, MENU_SECTION_MAX) } : category,
      ),
    );
  };

  const updateItem = (
    categoryIndex: number,
    itemIndex: number,
    patch: Partial<DraftMenuItem>,
  ) => {
    setDraft((prev) =>
      prev.map((category, i) =>
        i === categoryIndex
          ? {
              ...category,
              items: category.items.map((item, j) =>
                j === itemIndex ? { ...item, ...patch } : item,
              ),
            }
          : category,
      ),
    );
  };

  const patchDraftItem = (
    current: DraftMenuCategory[],
    categoryIndex: number,
    itemIndex: number,
    patch: Partial<DraftMenuItem>,
  ): DraftMenuCategory[] =>
    current.map((category, i) =>
      i === categoryIndex
        ? {
            ...category,
            items: category.items.map((item, j) =>
              j === itemIndex ? { ...item, ...patch } : item,
            ),
          }
        : category,
    );

  const removeItem = (categoryIndex: number, itemIndex: number) => {
    setDraft(
      draft
        .map((category, i) =>
          i === categoryIndex
            ? { ...category, items: category.items.filter((_, j) => j !== itemIndex) }
            : category,
        )
        .filter((category) => category.items.length > 0),
    );
  };

  const save = async (status: MenuItemStatus) => {
    setLeaveConfirm(false);
    setSaving(status);
    try {
      const result = await saveMenuDraft({ categories: draft, source: "ai", status });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't save the menu.");
        return;
      }
      const added = result.added ?? 0;
      const skipped = result.skipped ?? 0;
      toast.success(
        status === "draft"
          ? `Saved ${added} draft${added === 1 ? "" : "s"}${
              skipped > 0 ? ` · skipped ${skipped} already on the menu` : ""
            }`
          : `Added ${added} dish${added === 1 ? "" : "es"}${
              skipped > 0 ? ` · skipped ${skipped} already on the menu` : ""
            }`,
      );
      onSaved();
      onClose();
    } finally {
      setSaving(null);
    }
  };

  const requestClose = () => {
    if (saving || stage === "reading" || bulkMode) return;
    if (stage === "review" && draftCount > 0) {
      setLeaveConfirm(true);
      return;
    }
    onClose();
  };

  const applyAiPhoto = async (name: string, description: string): Promise<string | null> => {
    const result = await aiDishThumbnail({ name, description });
    if (!result.ok || !result.imageUrl) {
      throw new Error(result.error ?? "Couldn't generate a photo.");
    }
    try {
      return await compressDishDataUrl(result.imageUrl);
    } catch {
      // Compression failed — try the raw URL if it already fits.
      return result.imageUrl;
    }
  };

  const describeItem = async (categoryIndex: number, itemIndex: number) => {
    const category = draft[categoryIndex];
    const item = category?.items[itemIndex];
    if (!item?.name.trim()) {
      toast.error("Give the dish a name first.");
      return;
    }
    const key = `${categoryIndex}:${itemIndex}:desc`;
    setBusyKey(key);
    try {
      const result = await aiDescribeDish({
        name: item.name,
        section: category.name,
        existing: item.description,
      });
      if (!result.ok || !result.description) {
        toast.error(result.error ?? "Couldn't write a description.");
        return;
      }
      updateItem(categoryIndex, itemIndex, {
        description: result.description,
        prepMinutes: result.prepMinutes ?? item.prepMinutes,
        calories: result.calories ?? item.calories,
        spiceLevel: result.spiceLevel ?? item.spiceLevel,
        allergens: result.allergens ?? item.allergens,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const generateThumb = async (categoryIndex: number, itemIndex: number) => {
    const category = draft[categoryIndex];
    const item = category?.items[itemIndex];
    if (!item?.name.trim()) {
      toast.error("Give the dish a name first.");
      return;
    }
    const key = `${categoryIndex}:${itemIndex}:img`;
    setBusyKey(key);
    try {
      const imageUrl = await applyAiPhoto(item.name, item.description);
      if (!imageUrl) {
        toast.error("Couldn't generate a photo.");
        return;
      }
      updateItem(categoryIndex, itemIndex, { imageUrl });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate a photo.");
    } finally {
      setBusyKey(null);
    }
  };

  const uploadThumb = async (
    categoryIndex: number,
    itemIndex: number,
    file: File | undefined,
  ) => {
    if (!file) return;
    try {
      const imageUrl = await prepareDishThumbnail(file);
      updateItem(categoryIndex, itemIndex, { imageUrl });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't use that photo.");
    }
  };

  const toggleItemDiet = (
    categoryIndex: number,
    itemIndex: number,
    tag: DietTag,
  ) => {
    const item = draft[categoryIndex]?.items[itemIndex];
    if (!item) return;
    updateItem(categoryIndex, itemIndex, {
      diet: toggleDietTag(item.diet, tag),
    });
  };

  const toggleItemAllergen = (
    categoryIndex: number,
    itemIndex: number,
    tag: Allergen,
  ) => {
    const item = draft[categoryIndex]?.items[itemIndex];
    if (!item) return;
    updateItem(categoryIndex, itemIndex, {
      allergens: toggleAllergen(item.allergens, tag),
    });
  };

  /**
   * One-touch AI pass. For each dish: write cook method + ingredients + cook
   * time, then a photo. Progress advances after each real AI step finishes;
   * ETA is measured from those step durations.
   */
  const runBulkAi = async (mode: Exclude<BulkMode, null>) => {
    type Target = {
      categoryIndex: number;
      itemIndex: number;
      name: string;
      section: string;
      description: string;
      needsCopy: boolean;
      needsPhoto: boolean;
    };

    const targets: Target[] = [];
    draft.forEach((category, categoryIndex) => {
      category.items.forEach((item, itemIndex) => {
        if (!item.name.trim()) return;
        const needsCopy =
          mode === "everything" || mode === "copy"
            ? !item.description.trim() || item.prepMinutes == null
            : false;
        const needsPhoto =
          mode === "everything" || mode === "photos" ? !item.imageUrl : false;
        if (!needsCopy && !needsPhoto) return;
        targets.push({
          categoryIndex,
          itemIndex,
          name: item.name,
          section: category.name,
          description: item.description,
          needsCopy,
          needsPhoto,
        });
      });
    });

    if (targets.length === 0) {
      toast.message(
        mode === "photos"
          ? "Every dish already has a photo."
          : mode === "copy"
            ? "Every dish already has a description."
            : "Everything is already filled in.",
      );
      return;
    }

    const photoCost = AI_CREDIT_COSTS.dish_image;
    const copyCost = AI_CREDIT_COSTS.menu_description;
    const creditsNeeded = targets.reduce(
      (sum, target) =>
        sum +
        (target.needsCopy ? copyCost : 0) +
        (target.needsPhoto ? photoCost : 0),
      0,
    );
    const totalSteps = targets.reduce(
      (sum, target) =>
        sum + (target.needsCopy ? 1 : 0) + (target.needsPhoto ? 1 : 0),
      0,
    );

    const usage = await countMenuUsedForPlanMeter();
    if (!usage.ok) {
      toast.error(usage.error ?? "Couldn't check AI Credits.");
      return;
    }
    if (creditsNeeded > usage.generationsRemaining) {
      toast.error(
        usage.generationsRemaining <= 0
          ? `No AI Credits left (${usage.maxGenerations.toLocaleString("en-IN")} used). Upgrade your plan to add more credits, or enter details manually.`
          : `Needs ${creditsNeeded.toLocaleString("en-IN")} credits — only ${usage.generationsRemaining.toLocaleString("en-IN")} left. Upgrade to add more credits, or do fewer dishes.`,
      );
      return;
    }

    toast.message(
      `${creditsNeeded.toLocaleString("en-IN")} credit${creditsNeeded === 1 ? "" : "s"} will be used`,
    );

    const seedMs =
      mode === "copy"
        ? AI_STEP_SEED_MS.copy
        : mode === "photos"
          ? AI_STEP_SEED_MS.photo
          : AI_STEP_SEED_MS.everythingStep;

    const startedAt = Date.now();
    let doneSteps = 0;
    let avgMs: number | null = null;
    const first = targets[0];

    setBulkMode(mode);
    setBusyKey(`bulk:${mode}`);
    setBulkProgress({
      done: 0,
      total: totalSteps,
      label: first.needsCopy
        ? `Writing ${first.name}…`
        : `Photo for ${first.name}…`,
      startedAt,
      stepStartedAt: startedAt,
      avgMs: null,
      seedMs,
    });

    let okCount = 0;
    let failCount = 0;
    let partialCount = 0;
    let nextDraft = draft;
    let lastError = "";

    const markStep = (label: string) => {
      doneSteps += 1;
      avgMs = nextAvgMs(avgMs, doneSteps, Date.now() - startedAt);
      const stepStartedAt = Date.now();
      setBulkProgress({
        done: doneSteps,
        total: totalSteps,
        label,
        startedAt,
        stepStartedAt,
        avgMs,
        seedMs,
      });
    };

    try {
      for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i];
        let description = target.description;
        let prepMinutes: number | null | undefined;
        let calories: number | null | undefined;
        let spiceLevel: number | null | undefined;
        let allergens: Allergen[] | undefined;
        let imageUrl: string | null | undefined;
        let gotCopy = !target.needsCopy;
        let gotPhoto = !target.needsPhoto;
        const nextName = targets[i + 1]?.name;

        if (target.needsCopy) {
          setBulkProgress((prev) =>
            prev
              ? {
                  ...prev,
                  label: `Writing ${target.name}…`,
                  stepStartedAt: Date.now(),
                }
              : prev,
          );
          try {
            const copy = await aiDescribeDish({
              name: target.name,
              section: target.section,
              existing: target.description,
            });
            if (copy.ok && copy.description) {
              description = copy.description;
              prepMinutes = copy.prepMinutes ?? null;
              calories = copy.calories ?? null;
              spiceLevel = copy.spiceLevel ?? null;
              allergens = copy.allergens ?? [];
              gotCopy = true;
            } else {
              lastError = copy.error ?? "Couldn't write a description.";
            }
          } catch (error) {
            lastError =
              error instanceof Error ? error.message : "Couldn't write a description.";
          }
          markStep(
            target.needsPhoto
              ? `Photo for ${target.name}…`
              : nextName
                ? `Writing ${nextName}…`
                : "Finishing…",
          );
        }

        if (target.needsPhoto) {
          setBulkProgress((prev) =>
            prev
              ? {
                  ...prev,
                  label: `Photo for ${target.name}…`,
                  stepStartedAt: Date.now(),
                }
              : prev,
          );
          try {
            imageUrl = await applyAiPhoto(target.name, description);
            if (imageUrl) gotPhoto = true;
            else lastError = lastError || "Couldn't generate a photo.";
          } catch (error) {
            lastError =
              error instanceof Error
                ? error.message
                : lastError || "Couldn't generate a photo.";
          }
          markStep(
            nextName
              ? targets[i + 1]?.needsCopy
                ? `Writing ${nextName}…`
                : `Photo for ${nextName}…`
              : "Finishing…",
          );
        }

        const patch: Partial<DraftMenuItem> = {};
        if (target.needsCopy && gotCopy && description) {
          patch.description = description;
          if (prepMinutes !== undefined) patch.prepMinutes = prepMinutes;
          if (calories !== undefined) patch.calories = calories;
          if (spiceLevel !== undefined) patch.spiceLevel = spiceLevel;
          if (allergens !== undefined) patch.allergens = allergens;
        }
        if (target.needsPhoto && gotPhoto && imageUrl) {
          patch.imageUrl = imageUrl;
        }

        if (Object.keys(patch).length > 0) {
          nextDraft = patchDraftItem(
            nextDraft,
            target.categoryIndex,
            target.itemIndex,
            patch,
          );
          setDraft(nextDraft);
        }

        if (gotCopy && gotPhoto) okCount += 1;
        else if (Object.keys(patch).length > 0) partialCount += 1;
        else failCount += 1;
      }

      if (okCount > 0 && failCount === 0 && partialCount === 0) {
        toast.success(
          mode === "photos"
            ? `Generated ${okCount} photo${okCount === 1 ? "" : "s"}`
            : mode === "copy"
              ? `Wrote ${okCount} description${okCount === 1 ? "" : "s"}`
              : `AI filled ${okCount} dish${okCount === 1 ? "" : "es"}`,
        );
      } else if (okCount + partialCount > 0) {
        toast.success(
          `Done ${okCount + partialCount} · ${failCount} failed${
            lastError ? ` — ${lastError}` : " — retry those"
          }`,
        );
      } else {
        toast.error(lastError || "AI couldn't finish. Try again in a moment.");
      }
    } finally {
      setBusyKey(null);
      setBulkMode(null);
      setBulkProgress(null);
    }
  };

  const busy = saving !== null || busyKey !== null;

  return (
    <BottomSheet
      open={open}
      onClose={requestClose}
      labelledBy="menu-upload-title"
      className="merchant-theme merchant-edit-drawer"
    >
      <div className="merchant-edit-sheet">
        <div className="merchant-edit-sheet-head">
          <h3 id="menu-upload-title" className="merchant-edit-sheet-title">
            {stage === "reading"
              ? "Reading menu"
              : stage === "review"
                ? bulkProgress
                  ? "Generating…"
                  : "Review menu"
                : "Upload menu"}
          </h3>
          {stage === "pick" || (stage === "review" && !bulkProgress) ? (
            <p className="merchant-edit-sheet-sub">
              {stage === "pick"
                ? "Photos or a PDF — AI extracts dishes and prices (2 credits / dish)."
                : needsBulkEverything
                  ? "Fill gaps with AI, then save."
                  : "Edit anything below, then add to your menu."}
            </p>
          ) : null}
        </div>

        {stage === "pick" ? (
          <div className="merchant-edit-fields menu-upload-pick">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_UPLOAD_TYPES}
              multiple
              hidden
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <button
              type="button"
              className="menu-dropzone"
              onClick={() => inputRef.current?.click()}
            >
              <span className="menu-dropzone-icon" aria-hidden="true">
                <Upload size={20} strokeWidth={2} />
              </span>
              <span className="menu-dropzone-title">Choose files</span>
              <span className="menu-dropzone-sub">
                Up to {MAX_UPLOAD_FILES} · {formatBytes(MAX_TOTAL_BYTES)}
              </span>
            </button>

            {files.length > 0 ? (
              <ul className="menu-upload-list">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="menu-upload-item">
                    <span className="menu-upload-thumb" aria-hidden="true">
                      {file.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.previewUrl} alt="" />
                      ) : (
                        <FileText size={18} strokeWidth={2} />
                      )}
                    </span>
                    <span className="menu-upload-copy">
                      <span className="menu-upload-name">{file.name}</span>
                      <span className="menu-upload-meta">{formatBytes(file.bytes)}</span>
                    </span>
                    <button
                      type="button"
                      className="menu-icon-btn"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => removeFile(index)}
                    >
                      <X size={16} strokeWidth={2.2} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <button
              type="button"
              className="cta-btn merchant-cta-accent"
              disabled={files.length === 0}
              onClick={() => void read()}
            >
              <Sparkles size={16} strokeWidth={2.2} />
              {files.length === 0
                ? "Read with AI"
                : `Read ${files.length} file${files.length === 1 ? "" : "s"}`}
            </button>
          </div>
        ) : null}

        {stage === "reading" ? (
          <div className="merchant-edit-fields menu-reading">
            {readProgress ? (
              <MenuAiProgress progress={readProgress} />
            ) : (
              <div className="menu-reading-fallback">
                <span className="menu-reading-spinner" aria-hidden="true">
                  <Loader2 size={22} strokeWidth={2} />
                </span>
                <p className="menu-reading-title">Reading…</p>
              </div>
            )}
          </div>
        ) : null}

        {stage === "review" ? (
          <div className="merchant-edit-fields menu-upload-review">
            <div className={`menu-ai-hero${bulkProgress ? " is-busy" : ""}`}>
              <div className="menu-ai-hero-copy">
                <p className="menu-ai-hero-title">
                  {draftCount} dish{draftCount === 1 ? "" : "es"}
                  <span className="menu-ai-hero-meta">
                    · {draft.length} categor{draft.length === 1 ? "y" : "ies"}
                  </span>
                </p>
              </div>
              {bulkProgress ? (
                <MenuAiProgress progress={bulkProgress} />
              ) : (
                <div className="menu-ai-hero-actions">
                  {needsBulkEverything ? (
                    <>
                      <button
                        type="button"
                        className="cta-btn merchant-cta-accent menu-ai-hero-cta"
                        disabled={busy || draftCount === 0}
                        onClick={() => void runBulkAi("everything")}
                      >
                        <Sparkles size={16} strokeWidth={2.2} />
                        Generate everything with AI (
                        {bulkEverythingQuote.totalCredits.toLocaleString("en-IN")}{" "}
                        credits)
                      </button>
                      <p className="menu-ai-hero-quote">
                        {bulkEverythingQuote.items.toLocaleString("en-IN")} menu item
                        {bulkEverythingQuote.items === 1 ? "" : "s"}
                        {" · "}
                        {bulkEverythingQuote.imageCredits.toLocaleString("en-IN")} credits
                        image
                        {" · "}
                        {bulkEverythingQuote.descriptionCredits.toLocaleString("en-IN")}{" "}
                        credits Description
                      </p>
                    </>
                  ) : needsBulkCopy || needsBulkPhotos ? (
                    <div className="menu-ai-hero-row">
                      {needsBulkCopy ? (
                        <button
                          type="button"
                          className="menu-ai-chip"
                          disabled={busy}
                          onClick={() => void runBulkAi("copy")}
                        >
                          <Sparkles size={12} strokeWidth={2.4} />
                          Descriptions
                        </button>
                      ) : null}
                      {needsBulkPhotos ? (
                        <button
                          type="button"
                          className="menu-ai-chip"
                          disabled={busy}
                          onClick={() => void runBulkAi("photos")}
                        >
                          <ImagePlus size={12} strokeWidth={2.4} />
                          Photos
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="menu-review">
              {draft.map((category, categoryIndex) => (
                <section
                  key={`${category.name}-${categoryIndex}`}
                  className="menu-review-group"
                >
                  <header className="menu-review-category-head">
                    <input
                      className="menu-review-section"
                      value={category.name}
                      maxLength={MENU_SECTION_MAX}
                      aria-label="Category name"
                      onChange={(event) =>
                        updateCategoryName(categoryIndex, event.target.value)
                      }
                    />
                    <span className="menu-review-category-count">
                      {category.items.length}
                    </span>
                  </header>

                  <ul className="menu-review-items">
                    {category.items.map((item, itemIndex) => {
                      const descBusy = busyKey === `${categoryIndex}:${itemIndex}:desc`;
                      const imgBusy = busyKey === `${categoryIndex}:${itemIndex}:img`;
                      const bulkBusy = bulkMode != null;
                      return (
                        <li
                          key={`${item.name}-${itemIndex}`}
                          className="menu-review-card"
                        >
                          <div className="menu-review-card-top">
                            <div className="menu-review-media">
                              <div className="menu-review-thumb-wrap">
                                <label className="menu-review-thumb">
                                  {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl} alt="" />
                                  ) : (
                                    <span className="menu-review-thumb-empty">
                                      {imgBusy || (bulkBusy && !item.imageUrl) ? (
                                        <Loader2
                                          size={16}
                                          strokeWidth={2.2}
                                          className="menu-spin"
                                        />
                                      ) : (
                                        <ImagePlus size={18} strokeWidth={2} />
                                      )}
                                    </span>
                                  )}
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    hidden
                                    disabled={busy}
                                    onChange={(event) => {
                                      void uploadThumb(
                                        categoryIndex,
                                        itemIndex,
                                        event.target.files?.[0],
                                      );
                                      event.target.value = "";
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="menu-ai-chip menu-review-thumb-ai"
                                  disabled={busy}
                                  onClick={() =>
                                    void generateThumb(categoryIndex, itemIndex)
                                  }
                                >
                                  {imgBusy ? (
                                    <Loader2
                                      size={11}
                                      strokeWidth={2.4}
                                      className="menu-spin"
                                    />
                                  ) : (
                                    <Sparkles size={11} strokeWidth={2.4} />
                                  )}
                                  {imgBusy
                                    ? "…"
                                    : item.imageUrl
                                      ? `Redo ${creditButtonSuffix("dish_image_regenerate")}`
                                      : `Photo ${creditButtonSuffix("dish_image")}`}
                                </button>
                              </div>
                              {item.imageUrl ? (
                                <button
                                  type="button"
                                  className="menu-review-clear-photo"
                                  disabled={busy}
                                  onClick={() =>
                                    updateItem(categoryIndex, itemIndex, {
                                      imageUrl: null,
                                    })
                                  }
                                >
                                  Clear photo
                                </button>
                              ) : null}
                            </div>

                            <div className="menu-review-card-fields">
                              <div className="menu-review-identity">
                                <input
                                  className="menu-review-name"
                                  value={item.name}
                                  maxLength={MENU_NAME_MAX}
                                  aria-label="Dish name"
                                  onChange={(event) =>
                                    updateItem(categoryIndex, itemIndex, {
                                      name: event.target.value.slice(0, MENU_NAME_MAX),
                                    })
                                  }
                                />
                                <div className="menu-review-price-field">
                                  <span
                                    className="menu-review-price-cur"
                                    aria-hidden="true"
                                  >
                                    ₹
                                  </span>
                                  <input
                                    className="menu-review-price"
                                    inputMode="decimal"
                                    placeholder="—"
                                    aria-label="Price"
                                    value={item.price == null ? "" : String(item.price)}
                                    onChange={(event) => {
                                      const raw = event.target.value.replace(
                                        /[^0-9.]/g,
                                        "",
                                      );
                                      updateItem(categoryIndex, itemIndex, {
                                        price: raw === "" ? null : Number(raw),
                                      });
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="menu-icon-btn"
                                  aria-label={`Remove ${item.name}`}
                                  disabled={busy}
                                  onClick={() => removeItem(categoryIndex, itemIndex)}
                                >
                                  <Trash2 size={15} strokeWidth={2.2} />
                                </button>
                              </div>

                              <div
                                className="menu-review-tags menu-review-tags--diet"
                                role="group"
                                aria-label="Diet"
                              >
                                {DIET_TAGS.map((tag) => {
                                  const on = item.diet.includes(tag);
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      className={`menu-tag-chip menu-tag-chip--${tag}${
                                        on ? " is-on" : ""
                                      }`}
                                      aria-pressed={on}
                                      disabled={busy}
                                      onClick={() =>
                                        toggleItemDiet(categoryIndex, itemIndex, tag)
                                      }
                                    >
                                      <DietIcon tag={tag} size={11} />
                                      <span>{DIET_LABELS[tag]}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="menu-review-desc-field">
                            <div className="menu-review-desc-head">
                              <span className="menu-review-desc-label">Description</span>
                              <button
                                type="button"
                                className="menu-ai-chip"
                                disabled={busy}
                                onClick={() =>
                                  void describeItem(categoryIndex, itemIndex)
                                }
                              >
                                {descBusy ? (
                                  <Loader2
                                    size={12}
                                    strokeWidth={2.4}
                                    className="menu-spin"
                                  />
                                ) : (
                                  <Sparkles size={12} strokeWidth={2.4} />
                                )}
                                {descBusy
                                  ? "Writing…"
                                  : item.description.trim()
                                    ? `Rewrite ${creditButtonSuffix("rewrite_description")}`
                                    : `Write ${creditButtonSuffix("menu_description")}`}
                              </button>
                            </div>
                            <AiPending
                              busy={descBusy}
                              variant="top"
                              label={`Writing a description for ${item.name}`}
                            >
                              <textarea
                                className="menu-review-desc-input"
                                rows={2}
                                maxLength={MENU_DESC_MAX}
                                placeholder="How it’s cooked, main ingredients…"
                                value={item.description}
                                onChange={(event) =>
                                  updateItem(categoryIndex, itemIndex, {
                                    description: event.target.value.slice(
                                      0,
                                      MENU_DESC_MAX,
                                    ),
                                  })
                                }
                              />
                            </AiPending>

                            <div className="menu-review-card-meta">
                              <label className="menu-review-cook">
                                <Timer size={13} strokeWidth={2.4} aria-hidden="true" />
                                <AiPending
                                  busy={descBusy}
                                  label={`Estimating cook time for ${item.name}`}
                                >
                                  <input
                                    className="menu-review-cook-input"
                                    inputMode="numeric"
                                    placeholder="—"
                                    aria-label="Cook time in minutes"
                                    value={
                                      item.prepMinutes == null
                                        ? ""
                                        : String(item.prepMinutes)
                                    }
                                    onChange={(event) => {
                                      const raw = event.target.value.replace(
                                        /[^0-9]/g,
                                        "",
                                      );
                                      updateItem(categoryIndex, itemIndex, {
                                        prepMinutes:
                                          raw === ""
                                            ? null
                                            : Math.min(180, Number(raw)),
                                      });
                                    }}
                                  />
                                  <span className="menu-review-cook-unit">min</span>
                                </AiPending>
                              </label>
                              <label className="menu-review-cook">
                                <Flame size={13} strokeWidth={2.4} aria-hidden="true" />
                                <AiPending
                                  busy={descBusy}
                                  label={`Estimating calories for ${item.name}`}
                                >
                                  <input
                                    className="menu-review-cook-input menu-review-cook-input--wide"
                                    inputMode="numeric"
                                    placeholder="—"
                                    aria-label="Calories per serving"
                                    value={
                                      item.calories == null ? "" : String(item.calories)
                                    }
                                    onChange={(event) => {
                                      const raw = event.target.value.replace(
                                        /[^0-9]/g,
                                        "",
                                      );
                                      updateItem(categoryIndex, itemIndex, {
                                        calories:
                                          raw === ""
                                            ? null
                                            : Math.min(5000, Number(raw)),
                                      });
                                    }}
                                  />
                                  <span className="menu-review-cook-unit">kcal</span>
                                </AiPending>
                              </label>

                              <AiPending
                                busy={descBusy}
                                variant="block"
                                label={`Judging how spicy ${item.name} is`}
                              >
                                <div
                                  className="menu-review-tags menu-review-tags--spice"
                                  role="group"
                                  aria-label="Spice level"
                                >
                                  {SPICE_LABELS.map((label, level) => {
                                    const on = item.spiceLevel === level;
                                    return (
                                      <button
                                        key={label}
                                        type="button"
                                        className={`menu-tag-chip menu-tag-chip--spice${on ? " is-on" : ""}`}
                                        aria-pressed={on}
                                        disabled={busy}
                                        onClick={() =>
                                          updateItem(categoryIndex, itemIndex, {
                                            spiceLevel: on ? null : level,
                                          })
                                        }
                                      >
                                        {level > 0 ? (
                                          <SpiceIcons level={level} size={11} />
                                        ) : null}
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </AiPending>
                            </div>
                          </div>

                          <div className="menu-review-allergens">
                            <span className="menu-review-desc-label">Allergens</span>
                            <AiPending
                              busy={descBusy}
                              variant="block"
                              label={`Tagging allergens for ${item.name}`}
                            >
                              <div
                                className="menu-review-tags menu-review-tags--allergens"
                                role="group"
                                aria-label="Allergens"
                              >
                                {ALLERGENS.map((tag) => {
                                  const on = item.allergens.includes(tag);
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      className={`menu-tag-chip${on ? " is-on" : ""}`}
                                      aria-pressed={on}
                                      disabled={busy}
                                      onClick={() =>
                                        toggleItemAllergen(
                                          categoryIndex,
                                          itemIndex,
                                          tag,
                                        )
                                      }
                                    >
                                      {ALLERGEN_LABELS[tag]}
                                    </button>
                                  );
                                })}
                              </div>
                            </AiPending>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="menu-review-actions">
              <button
                type="button"
                className="cta-btn merchant-cta-accent"
                disabled={busy || draftCount === 0}
                onClick={() => void save("live")}
              >
                {saving === "live"
                  ? "Saving…"
                  : `Save ${draftCount} to menu`}
              </button>
              <button
                type="button"
                className="menu-secondary-btn"
                disabled={busy || draftCount === 0}
                onClick={() => void save("draft")}
              >
                {saving === "draft" ? "Saving…" : "Save as draft"}
              </button>
              <button
                type="button"
                className="menu-text-btn"
                disabled={busy}
                onClick={() => {
                  setDraft([]);
                  setStage("pick");
                  setLeaveConfirm(false);
                }}
              >
                Start over
              </button>
            </div>
          </div>
        ) : null}

        {leaveConfirm ? (
          <div className="menu-leave-confirm" role="dialog" aria-labelledby="menu-leave-title">
            <p id="menu-leave-title" className="menu-leave-confirm-title">
              Save before closing?
            </p>
            <p className="menu-leave-confirm-text">
              {draftCount.toLocaleString("en-IN")} dish
              {draftCount === 1 ? "" : "es"} aren&apos;t on your menu yet.
            </p>
            <div className="menu-leave-confirm-actions">
              <div className="menu-leave-confirm-save">
                <button
                  type="button"
                  className="cta-btn merchant-cta-accent"
                  disabled={busy || draftCount === 0}
                  onClick={() => void save("live")}
                >
                  {saving === "live" ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="menu-secondary-btn"
                  disabled={busy || draftCount === 0}
                  onClick={() => void save("draft")}
                >
                  {saving === "draft" ? "Saving…" : "Save as draft"}
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
