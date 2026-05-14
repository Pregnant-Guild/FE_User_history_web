"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";

import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";

import type { WikiSnapshot } from "@/uhm/types/wiki";
import { newId } from "@/uhm/lib/utils/id";
import type ReactQuill from "react-quill-new";
import { checkWikiSlugExists, fetchWikiBySlug, searchWikisByTitle, type Wiki } from "@/uhm/api/wikis";
import NewBadge from "@/uhm/components/editor/NewBadge";

type ReactQuillProps = ComponentProps<typeof ReactQuill>;
type QuillRange = { index: number; length: number };
type QuillLike = {
  getSelection?: () => QuillRange | null;
  getFormat?: (...args: unknown[]) => Record<string, unknown>;
  setSelection?: (...args: unknown[]) => void;
  formatText?: (...args: unknown[]) => void;
  insertText?: (...args: unknown[]) => void;
  format?: (...args: unknown[]) => void;
  getText?: (index: number, length: number) => string;
};
type QuillModule = {
  Quill?: {
    import?: (path: string) => unknown;
    register?: (pathOrModule: unknown, moduleOrOverwrite?: unknown, overwrite?: boolean) => void;
  };
};
type QuillLinkFormat = {
  sanitize?: (url: unknown) => unknown;
  __uhmAllowSlugHref?: boolean;
  __uhmOriginalSanitize?: unknown;
};

const ReactQuillEditor = dynamic<ReactQuillProps>(() => import("react-quill-new"), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full animate-pulse bg-gray-100 rounded-lg" />,
});

let quillLinkSanitizePatched = false;

type Props = {
  projectId: string;
  wikis: WikiSnapshot[];
  setWikis: React.Dispatch<React.SetStateAction<WikiSnapshot[]>>;
  requestedActiveId?: string | null;
};

function clampTitle(title: string) {
  const t = title.trim();
  return t.length ? t.slice(0, 120) : "Untitled wiki";
}

export default function WikiSidebarPanel({ projectId, wikis, setWikis, requestedActiveId }: Props) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const activeWiki = useMemo(() => wikis.find((w) => w.id === activeId) || null, [activeId, wikis]);

  const [wikiTitle, setWikiTitle] = useState("");
  const [wikiSlug, setWikiSlug] = useState("");
  const [wikiDocHtml, setWikiDocHtml] = useState("");
  const wikiDocStorageFormat = useMemo(() => detectWikiDocStorageFormat(wikiDocHtml), [wikiDocHtml]);
  const [wikiSaveError, setWikiSaveError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createSlugTouched, setCreateSlugTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCheckingCreateSlug, setIsCheckingCreateSlug] = useState(false);

  // Quill: custom link UI (link-to-wiki by slug).
  const wikiLinkIntentRef = useRef<{
    quill: QuillLike;
    range: QuillRange | null;
    activeWikiId: string | null;
    existingHref: string | null;
  } | null>(null);
  const wikiLinkHandlerRef = useRef<(quill: QuillLike | null | undefined) => void>(() => {});
  const [isWikiLinkOpen, setIsWikiLinkOpen] = useState(false);
  const [wikiLinkQuery, setWikiLinkQuery] = useState("");
  const [wikiLinkError, setWikiLinkError] = useState<string | null>(null);
  const [wikiLinkSearchMode, setWikiLinkSearchMode] = useState<"title" | "slug">("title");
  const [globalWikiResults, setGlobalWikiResults] = useState<Wiki[]>([]);
  const [isGlobalWikiSearching, setIsGlobalWikiSearching] = useState(false);
  const [globalWikiSearchError, setGlobalWikiSearchError] = useState<string | null>(null);
  const globalWikiSearchRequestRef = useRef(0);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // Allow Quill to keep wiki links where href is a slug (no scheme).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (quillLinkSanitizePatched) return;
    quillLinkSanitizePatched = true;

    (async () => {
      try {
        const mod = await import("react-quill-new") as QuillModule;
        const Quill = mod?.Quill;
        if (!Quill) return;

        try {
          const BlotFormatterModule = await import("quill-blot-formatter");
          const BlotFormatter = BlotFormatterModule.default;
          // Only register if not already registered to avoid errors in dev/HMR
          Quill.register?.("modules/blotFormatter", BlotFormatter, true);
        } catch (err) {
          console.error("Failed to load quill-blot-formatter", err);
        }

        const ImageFormat = Quill.import?.("formats/image") as any;
        if (ImageFormat) {
          class CustomImage extends ImageFormat {
            static formats(domNode: Element) {
              const formats = ImageFormat.formats(domNode) || {};
              if (domNode.hasAttribute("style")) formats.style = domNode.getAttribute("style");
              if (domNode.hasAttribute("width")) formats.width = domNode.getAttribute("width");
              if (domNode.hasAttribute("height")) formats.height = domNode.getAttribute("height");
              if (domNode.hasAttribute("class")) formats.class = domNode.getAttribute("class");
              return formats;
            }

            format(name: string, value: string) {
              if (["style", "width", "height", "class"].includes(name)) {
                if (value) {
                  this.domNode.setAttribute(name, value);
                } else {
                  this.domNode.removeAttribute(name);
                }
              } else {
                super.format(name, value);
              }
            }
          }
          Quill.register?.(CustomImage, true);
        }

        const Link = Quill.import?.("formats/link");
        if (!Link) return;

        const anyLink = Link as QuillLinkFormat;
        if (anyLink.__uhmAllowSlugHref) return;
        const original = anyLink.sanitize;
        anyLink.sanitize = (url: unknown) => {
          const value = String(url ?? "").trim();
          const lower = value.toLowerCase();
          if (lower.startsWith("javascript:")) return "";
          // Keep slug/relative/external as-is; rendering layer will rewrite slug links for navigation.
          return value;
        };
        anyLink.__uhmAllowSlugHref = true;
        anyLink.__uhmOriginalSanitize = original;
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (!requestedActiveId) return;
    if (wikis.some((w) => w.id === requestedActiveId)) {
      setActiveId(requestedActiveId);
    }
  }, [requestedActiveId, wikis]);

  // keep editor content in sync when switching wiki
  useEffect(() => {
    if (!open) return;

    setWikiTitle(activeWiki?.title || "");
    setWikiSlug(typeof activeWiki?.slug === "string" ? activeWiki.slug : "");
    setWikiDocHtml(normalizeWikiDocForQuill(activeWiki?.doc || null));
    setWikiSaveError(null);
  }, [activeWiki?.doc, activeWiki?.slug, activeWiki?.title, open]);

  const ensureActive = () => {
    if (activeId && wikis.some((w) => w.id === activeId)) return;
    setActiveId(wikis[0]?.id || null);
  };

  useEffect(() => {
    ensureActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wikis.length]);

  const createWikiAndOpen = (title?: string, slug?: string | null) => {
    const id = newId();
    const seedTitle = clampTitle(title || "Untitled wiki");
    const seed: WikiSnapshot = {
      id,
      source: "inline",
      operation: "create",
      title: seedTitle,
      slug: slug ?? null,
      doc: "",
      updated_at: new Date().toISOString(),
    };
    setWikis((prev) => [seed, ...prev]);
    setActiveId(id);
    setOpen(true);
  };

  const handleCreateWikiFromPanel = async () => {
    const title = clampTitle(createTitle);
    const slug = normalizeWikiSlugInput(createSlug);
    if (!slug) {
      setCreateError("Slug la bat buoc. Hay thu mot slug khac.");
      return;
    }

    setIsCheckingCreateSlug(true);
    setCreateError(null);
    try {
      const exists = await checkWikiSlugExists(slug);
      if (exists) {
        setCreateError("Slug da ton tai. Hay thu slug khac.");
        return;
      }
      createWikiAndOpen(title, slug);
      setCreateTitle("");
      setCreateSlug("");
      setCreateSlugTouched(false);
      setIsCreateOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Khong check duoc slug.";
      setCreateError(msg);
    } finally {
      setIsCheckingCreateSlug(false);
    }
  };

  const removeWiki = (id: string) => {
    setWikis((prev) => prev.filter((w) => w.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const saveWiki = async () => {
    if (!activeId) return;
    const payload = wikiDocHtml;
    const nextTitle = clampTitle(wikiTitle);
    const nextSlug = normalizeWikiSlugInput(wikiSlug);

    const current = wikis.find((w) => w.id === activeId) || null;
    // Check uniqueness only when creating a brand-new wiki.
    if (current?.operation === "create" && nextSlug) {
      try {
        const exists = await checkWikiSlugExists(nextSlug);
        if (exists) {
          setWikiSaveError("Slug da ton tai. Hay thu slug khac.");
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Khong check duoc slug.";
        setWikiSaveError(msg);
        return;
      }
    }

    setWikiSaveError(null);
    setWikis((prev) =>
          prev.map((w) =>
            w.id !== activeId
              ? w
              : {
                  ...w,
                  source: w.source,
                  operation: w.operation === "create" ? "create" : "update",
                  title: nextTitle,
                  slug: nextSlug,
                  doc: payload,
                  updated_at: new Date().toISOString(),
            }
      )
    );
    setOpen(false);
  };

  const exportCurrentWikiDoc = useCallback(() => {
    if (!activeId) return;

    const fmt = detectWikiDocStorageFormat(wikiDocHtml);
    const label = fmt === "json" ? "json" : fmt === "text" ? "txt" : "html";
    const mime =
      fmt === "json"
        ? "application/json;charset=utf-8"
        : fmt === "text"
          ? "text/plain;charset=utf-8"
          : "text/html;charset=utf-8";

    const base =
      normalizeWikiSlugInput(wikiSlug) ||
      slugifyWikiTitle(wikiTitle) ||
      String(activeId).slice(0, 8);
    const filename = `${base}.${label}`;

    downloadTextFile(filename, wikiDocHtml || "", mime);
  }, [activeId, wikiDocHtml, wikiSlug, wikiTitle]);

  const openImportPicker = useCallback(() => {
    if (!activeId) return;
    importFileInputRef.current?.click();
  }, [activeId]);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      // Allow selecting the same file again.
      e.target.value = "";
      if (!file) return;
      if (!activeId) return;

      try {
        // Only accept HTML import to match the current Quill storage format.
        const name = (file.name || "").toLowerCase();
        const isHtml =
          name.endsWith(".html") ||
          name.endsWith(".htm") ||
          String(file.type || "").toLowerCase().includes("text/html");
        if (!isHtml) {
          setWikiSaveError("Chi ho tro import file HTML (.html/.htm).");
          return;
        }

        const text = await file.text();
        const raw = String(text || "").trim();
        if (!raw.length) {
          setWikiDocHtml("");
          setWikiSaveError(null);
          return;
        }
        if (raw[0] !== "<") {
          setWikiSaveError("Noi dung file khong phai HTML hop le.");
          return;
        }
        setWikiDocHtml(raw);
        setWikiSaveError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Khong import duoc file.";
        setWikiSaveError(msg);
      }
    },
    [activeId]
  );

  const closeWikiLinkModal = useCallback(() => {
    setIsWikiLinkOpen(false);
    setWikiLinkQuery("");
    setWikiLinkError(null);
    setGlobalWikiResults([]);
    setIsGlobalWikiSearching(false);
    setGlobalWikiSearchError(null);
    wikiLinkIntentRef.current = null;
  }, []);

  type WikiLinkOption = {
    key: string;
    title: string;
    slug: string;
    source: "local" | "global";
  };

  const localWikiLinkCandidates = useMemo<WikiLinkOption[]>(() => {
    if (!isWikiLinkOpen) return [];
    const q = wikiLinkQuery.trim().toLowerCase();
    const active = wikiLinkIntentRef.current?.activeWikiId ?? activeId;

    const base = (wikis || [])
      .filter((w) => w && typeof w.id === "string")
      .filter((w) => w.id !== active)
      // Link value must be slug.
      .filter((w) => typeof w.slug === "string" && w.slug.trim().length > 0);

    const filtered = (() => {
      if (!q.length) return base;
      if (wikiLinkSearchMode === "slug") {
        return base.filter((w) => String(w.slug || "").toLowerCase().includes(q));
      }
      return base.filter((w) => (w.title || "").toLowerCase().includes(q));
    })();

    return filtered.slice(0, 20).map((w) => ({
      key: `local:${w.id}`,
      title: (w.title || "").trim() || "Untitled wiki",
      slug: String(w.slug).trim(),
      source: "local",
    }));
  }, [activeId, isWikiLinkOpen, wikiLinkQuery, wikiLinkSearchMode, wikis]);

  useEffect(() => {
    if (!isWikiLinkOpen) return;

    const keyword = wikiLinkQuery.trim();
    if (!keyword.length) {
      setGlobalWikiResults([]);
      setIsGlobalWikiSearching(false);
      setGlobalWikiSearchError(null);
      return;
    }

    let disposed = false;
    const requestId = ++globalWikiSearchRequestRef.current;
    const timeoutId = window.setTimeout(async () => {
      setIsGlobalWikiSearching(true);
      setGlobalWikiSearchError(null);
      try {
        const rows =
          wikiLinkSearchMode === "slug"
            ? (() => fetchWikiBySlug(keyword))()
            : (() => searchWikisByTitle(keyword, { limit: 12 }))();

        const resolved = await rows;
        if (disposed || requestId !== globalWikiSearchRequestRef.current) return;

        const list = Array.isArray(resolved) ? resolved : resolved ? [resolved] : [];
        setGlobalWikiResults(list);
      } catch (err) {
        if (disposed || requestId !== globalWikiSearchRequestRef.current) return;
        console.error("Search global wikis failed", err);
        setGlobalWikiResults([]);
        setGlobalWikiSearchError("Khong search duoc wiki tren server.");
      } finally {
        if (!disposed && requestId === globalWikiSearchRequestRef.current) {
          setIsGlobalWikiSearching(false);
        }
      }
    }, 260);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [isWikiLinkOpen, wikiLinkQuery, wikiLinkSearchMode]);

  const globalWikiLinkCandidates = useMemo<WikiLinkOption[]>(() => {
    if (!isWikiLinkOpen) return [];
    const active = wikiLinkIntentRef.current?.activeWikiId ?? activeId;
    const activeSlug = (wikis || []).find((w) => w.id === active)?.slug ?? null;
    const normalizedActiveSlug = typeof activeSlug === "string" ? activeSlug.trim() : "";

    const out: WikiLinkOption[] = [];
    for (const row of globalWikiResults || []) {
      const slug = typeof row?.slug === "string" ? row.slug.trim() : "";
      if (!slug.length) continue;
      if (normalizedActiveSlug && slug === normalizedActiveSlug) continue;
      out.push({
        key: `global:${row.id || slug}`,
        title: (row.title || "").trim() || "Untitled wiki",
        slug,
        source: "global",
      });
    }
    return out.slice(0, 20);
  }, [activeId, globalWikiResults, isWikiLinkOpen, wikis]);

  const wikiLinkCandidates = useMemo<WikiLinkOption[]>(() => {
    const localSlugs = new Set(localWikiLinkCandidates.map((w) => w.slug));
    const dedupedGlobal = globalWikiLinkCandidates.filter((w) => !localSlugs.has(w.slug));
    return [...localWikiLinkCandidates, ...dedupedGlobal];
  }, [globalWikiLinkCandidates, localWikiLinkCandidates]);

  const applyWikiLink = useCallback((target: WikiLinkOption) => {
    const intent = wikiLinkIntentRef.current;
    const quill = intent?.quill;
    if (!quill) return;

    const slug = target.slug.trim();

    const range = intent?.range ?? quill.getSelection?.() ?? null;
    if (!range) {
      setWikiLinkError("Khong lay duoc vi tri selection trong editor.");
      return;
    }

    // Restore selection to ensure format applies to the expected range.
    quill.setSelection?.(range.index, range.length, "silent");

    if (range.length > 0) {
      quill.formatText?.(range.index, range.length, "link", slug, "user");
      closeWikiLinkModal();
      return;
    }

    // No selection: insert the wiki title (or slug) and link it.
    const label = (target.title || "").trim() || slug;
    quill.insertText?.(range.index, label, { link: slug }, "user");
    quill.setSelection?.(range.index + label.length, 0, "silent");
    closeWikiLinkModal();
  }, [closeWikiLinkModal]);

  const applyMissingWikiLink = useCallback(() => {
    const intent = wikiLinkIntentRef.current;
    const quill = intent?.quill;
    if (!quill) return;

    const href = "__missing__";
    const range = intent?.range ?? quill.getSelection?.() ?? null;
    if (!range) {
      setWikiLinkError("Khong lay duoc vi tri selection trong editor.");
      return;
    }

    quill.setSelection?.(range.index, range.length, "silent");

    if (range.length > 0) {
      quill.formatText?.(range.index, range.length, "link", href, "user");
      closeWikiLinkModal();
      return;
    }

    // No selection: insert query text (best effort) and mark it as a missing link.
    const label = wikiLinkQuery.trim().slice(0, 120) || "link";
    quill.insertText?.(range.index, label, { link: href }, "user");
    quill.setSelection?.(range.index + label.length, 0, "silent");
    closeWikiLinkModal();
  }, [closeWikiLinkModal, wikiLinkQuery]);

  const removeWikiLink = useCallback(() => {
    const intent = wikiLinkIntentRef.current;
    const quill = intent?.quill;
    if (!quill) return;
    const range = intent?.range ?? quill.getSelection?.() ?? null;
    if (!range) return;
    quill.setSelection?.(range.index, range.length, "silent");
    if (range.length > 0) {
      quill.formatText?.(range.index, range.length, "link", false, "user");
    } else {
      quill.format?.("link", false, "user");
    }
    closeWikiLinkModal();
  }, [closeWikiLinkModal]);

  // Keep handler ref updated while keeping modules object stable.
  wikiLinkHandlerRef.current = (quill: QuillLike | null | undefined) => {
    if (!quill) return;
    const range = quill.getSelection?.() ?? null;
    // Try to read current link format (if any) from the selection.
    const existingHref =
      range && (quill.getFormat?.(range)?.link ?? quill.getFormat?.(range.index, range.length)?.link) || null;

    wikiLinkIntentRef.current = {
      quill,
      range,
      activeWikiId: activeId,
      existingHref: typeof existingHref === "string" ? existingHref : null,
    };

    // Seed query with selected text (best effort).
    const selectedText =
      range && range.length > 0 ? String(quill.getText?.(range.index, range.length) || "").trim() : "";
    setWikiLinkQuery(selectedText.slice(0, 80));
    setWikiLinkError(null);
    setIsWikiLinkOpen(true);
  };

  const quillModules = useMemo(() => {
    return {
      toolbar: {
        container: QUILL_TOOLBAR,
        handlers: {
          // NOTE: use function() to preserve Quill toolbar `this` binding.
          link: function (this: { quill?: QuillLike }) {
            wikiLinkHandlerRef.current(this?.quill);
          },
        },
      },
      blotFormatter: {},
    };
  }, []);

  return (
    <div
      style={{
        padding: "10px",
        background: "#0b1220",
        borderRadius: "8px",
        border: "1px solid #1f2937",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ fontWeight: 700, fontSize: "14px" }}>Wiki</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>{wikis.length}</div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Mo panel" : "Thu gon panel"}
            aria-label={collapsed ? "Mo panel Wiki" : "Thu gon panel Wiki"}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#0b1220",
              color: "#e2e8f0",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            {collapsed ? <PlusIcon /> : <MinusIcon />}
          </button>
        </div>
      </div>

      {collapsed ? null : wikis.length ? (
        <div style={{ marginTop: "10px", display: "grid", gap: "6px", maxHeight: 250, overflowY: "auto", paddingRight: 4 }}>
          {wikis.map((w) => (
            <div
              key={w.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid #1f2937",
                background: "transparent",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveId(w.id);
                  setOpen(true);
                }}
                style={{
                  flex: 1,
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
                title={w.title}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "12px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {w.title}
                  </span>
                  {isNewWiki(w) ? <NewBadge /> : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => removeWiki(w.id)}
                style={{
                  border: "none",
                  background: "#111827",
                  color: "#fca5a5",
                  cursor: "pointer",
                  borderRadius: "6px",
                  padding: "6px 8px",
                  fontSize: "12px",
                }}
                title="Remove"
              >
                Del
              </button>
            </div>
          ))}

        </div>
      ) : (
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#94a3b8" }}>
          No wiki yet for this project.
        </div>
      )}

      {collapsed ? null : (
      <div
        style={{
          marginTop: "10px",
          display: "grid",
          gap: "8px",
          border: "1px solid #1e3a8a",
          borderRadius: "8px",
          padding: "8px",
          background: "#0f172a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ color: "#bfdbfe", fontWeight: 700, fontSize: "12px" }}>
            Tạo wiki mới
          </div>
          <button
            type="button"
            onClick={() =>
              setIsCreateOpen((v) => {
                const next = !v;
                if (next) {
                  setCreateError(null);
                  setIsCheckingCreateSlug(false);
                  setCreateSlugTouched(false);
                }
                return next;
              })
            }
            title={isCreateOpen ? "Dong" : "Mo"}
            aria-label={isCreateOpen ? "Dong tao wiki" : "Mo tao wiki"}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#0b1220",
              color: "#e2e8f0",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            {isCreateOpen ? <CloseIcon /> : <PlusIcon />}
          </button>
        </div>

        {isCreateOpen ? (
          <>
            <input
              value={createTitle}
              onChange={(e) => {
                const nextTitle = e.target.value;
                setCreateTitle(nextTitle);
                setCreateError(null);
                if (!createSlugTouched) {
                  setCreateSlug(slugifyWikiTitle(nextTitle));
                }
              }}
              placeholder="Tieu de wiki"
              disabled={isCheckingCreateSlug}
              style={{
                width: "100%",
                borderRadius: "6px",
                border: "1px solid #334155",
                background: "#111827",
                color: "#f8fafc",
                padding: "6px 8px",
                fontSize: "13px",
              }}
            />
            <input
              value={createSlug}
              onChange={(e) => {
                setCreateSlugTouched(true);
                setCreateSlug(e.target.value);
                setCreateError(null);
              }}
              placeholder="Slug"
              disabled={isCheckingCreateSlug}
              style={{
                width: "100%",
                borderRadius: "6px",
                border: "1px solid #334155",
                background: "#111827",
                color: "#f8fafc",
                padding: "6px 8px",
                fontSize: "13px",
              }}
            />
            <button
              type="button"
              onClick={handleCreateWikiFromPanel}
              disabled={isCheckingCreateSlug}
              style={{
                border: "none",
                borderRadius: "6px",
                padding: "7px 8px",
                cursor: isCheckingCreateSlug ? "not-allowed" : "pointer",
                background: "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
                opacity: isCheckingCreateSlug ? 0.7 : 1,
              }}
            >
              Tạo wiki mới
            </button>
            {createError ? (
              <div style={{ color: "#fca5a5", fontSize: 12 }}>
                {createError}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      )}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        showCloseButton={false}
        // Defensive: even if Modal defaults change, keep wiki popup free of the "X" close button.
        className="max-w-[1100px] m-4 [&>button]:hidden"
      >
        <div className="p-6 bg-white rounded-3xl dark:bg-gray-900 max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col">
          <input
            ref={importFileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            onChange={handleImportFile}
            style={{ display: "none" }}
          />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs text-gray-500 dark:text-gray-400">Project</div>
              <div className="text-sm font-mono break-all text-gray-700 dark:text-gray-200">{projectId}</div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={openImportPicker}
                disabled={!activeId}
                title="Import HTML"
              >
                Import
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={exportCurrentWikiDoc}
                disabled={!activeId}
                title={`Export ${wikiDocStorageFormat.toUpperCase()}`}
              >
                Export {wikiDocStorageFormat.toUpperCase()}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={saveWiki} disabled={!activeId}>
                Save
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0 overflow-auto">

            <div className="lg:col-span-5">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Title</Label>
                  <input
                    value={wikiTitle}
                    onChange={(e) => setWikiTitle(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
                    placeholder="Wiki title"
                    disabled={!activeId}
                  />
                </div>
                <div>
                  <Label>Slug</Label>
                  <input
                    value={wikiSlug}
                    onChange={(e) => setWikiSlug(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
                    placeholder="wiki-slug"
                    disabled={!activeId}
                  />
                </div>
                {wikiSaveError ? (
                  <div className="text-xs text-red-600 dark:text-red-300">
                    {wikiSaveError}
                  </div>
                ) : null}

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117] overflow-hidden">
                  <ReactQuillEditor
                    theme="snow"
                    value={wikiDocHtml}
                    onChange={(content: string) => setWikiDocHtml(content)}
                    modules={quillModules}
                    className="min-h-[320px] uhm-wiki-quill"
                    placeholder="Nhap noi dung wiki..."
                    readOnly={!activeId}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <style jsx global>{`
        /* Quill editor content is inheriting a light-on-dark color in some themes.
           Force paragraph/text to be readable on the wiki editor's (light) background. */
        .uhm-wiki-quill .ql-editor {
          color: #000 !important;
        }
        .uhm-wiki-quill .ql-editor p {
          color: #000 !important;
        }
        /* Differentiate missing links vs real links inside the editor. */
        .uhm-wiki-quill .ql-editor a {
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .uhm-wiki-quill .ql-editor a[href="__missing__"],
        .uhm-wiki-quill .ql-editor a:not([href]),
        .uhm-wiki-quill .ql-editor a[href=""] {
          color: #dc2626 !important;
        }
        .uhm-wiki-quill .ql-editor a[href]:not([href=""]):not([href="__missing__"]) {
          color: #2563eb !important;
        }
      `}</style>

      <Modal
        isOpen={isWikiLinkOpen}
        onClose={closeWikiLinkModal}
        className="max-w-[620px] p-6"
      >
        <div className="grid gap-4">
          <div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">Link wiki</div>
          </div>

          <div>
            <Label>Search</Label>
            <div className="flex items-center gap-2">
              <input
                value={wikiLinkQuery}
                onChange={(e) => setWikiLinkQuery(e.target.value)}
                className="h-11 flex-1 min-w-0 rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
                placeholder={wikiLinkSearchMode === "slug" ? "Nhap slug..." : "Nhap title wiki..."}
                autoFocus
              />
              <select
                value={wikiLinkSearchMode}
                onChange={(e) => setWikiLinkSearchMode(e.target.value === "slug" ? "slug" : "title")}
                className="h-11 rounded-xl border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
                aria-label="Search mode"
              >
                <option value="title">Title</option>
                <option value="slug">Slug</option>
              </select>
            </div>
            {wikiLinkError ? (
              <div className="mt-2 text-xs text-red-600 dark:text-red-300">{wikiLinkError}</div>
            ) : null}
            {globalWikiSearchError ? (
              <div className="mt-2 text-xs text-red-600 dark:text-red-300">{globalWikiSearchError}</div>
            ) : null}
          </div>

          <div className="max-h-[320px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117]">
            <div className="p-2 grid gap-1">
              {isGlobalWikiSearching ? (
                <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Searching…</div>
              ) : null}
              {wikiLinkCandidates.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => applyWikiLink(w)}
                  className="w-full text-left rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/[0.03] px-3 py-2 transition"
                  title={w.slug || undefined}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {(w.title || "").trim() || "Untitled wiki"}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {String(w.slug)}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        w.source === "local"
                          ? "border-emerald-300/60 text-emerald-600 dark:text-emerald-300"
                          : "border-blue-300/60 text-blue-600 dark:text-blue-300"
                      }`}
                    >
                      {w.source}
                    </span>
                  </div>
                </button>
              ))}
              {wikiLinkCandidates.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                  Khong tim thay wiki phu hop (hoac cac wiki khac chua co slug).
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={applyMissingWikiLink}>
              Empty link
            </Button>
            {wikiLinkIntentRef.current?.existingHref ? (
              <Button size="sm" variant="outline" onClick={removeWikiLink}>
                Remove link
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={closeWikiLinkModal}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function isNewWiki(wiki: WikiSnapshot | null | undefined): boolean {
  return wiki?.source === "inline" && wiki?.operation === "create";
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const QUILL_TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  [{ align: [] }, { align: "center" }, { align: "right" }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["blockquote", "code-block"],
  ["link", "image"],
  ["clean"],
];

function normalizeWikiDocForQuill(doc: string | null): string {
  const raw = (doc || "").trim();
  if (!raw.length) return "";

  // New format (Quill): HTML string.
  if (raw[0] === "<") return raw;

  // Legacy format (Tiptap): JSON string.
  if (raw[0] === "{") {
    try {
      const json: unknown = JSON.parse(raw);
      const text = tiptapJsonToPlainText(json).trim();
      if (!text.length) return "";
      return `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`;
    } catch {
      // fall through
    }
  }

  // Unknown plaintext: treat as plain text.
  return `<p>${escapeHtml(raw).replace(/\n/g, "<br/>")}</p>`;
}

function normalizeWikiSlugInput(raw: string): string | null {
  const s = raw.trim();
  return s.length ? s : null;
}

function slugifyWikiTitle(raw: string): string {
  const input = String(raw || "").trim();
  if (!input.length) return "";
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tiptapJsonToPlainText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(tiptapJsonToPlainText).join("");

  if (isRecord(node)) {
    if (node.type === "text" && typeof node.text === "string") return node.text;
    if (node.type === "hardBreak") return "\n";
    if ("content" in node) return tiptapJsonToPlainText(node.content);
  }

  return "";
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

type WikiDocStorageFormat = "html" | "json" | "text";

function detectWikiDocStorageFormat(doc: string): WikiDocStorageFormat {
  const raw = String(doc || "").trim();
  if (!raw.length) return "html";
  const first = raw[0];
  if (first === "<") return "html";
  if (first === "{" || first === "[") return "json";
  return "text";
}

function downloadTextFile(filename: string, contents: string, mime: string): void {
  if (typeof window === "undefined") return;
  const safeName = String(filename || "export.txt").replace(/[\\/]+/g, "_");
  const blob = new Blob([contents], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
