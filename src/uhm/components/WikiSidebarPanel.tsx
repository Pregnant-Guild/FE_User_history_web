"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";

import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";

import type { WikiSnapshot } from "@/uhm/types/wiki";
import { newId } from "@/uhm/lib/id";
import type ReactQuill from "react-quill-new";
import { checkWikiSlugExists } from "@/uhm/api/wikis";

type ReactQuillProps = ComponentProps<typeof ReactQuill>;

const ReactQuillEditor = dynamic<ReactQuillProps>(() => import("react-quill-new"), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full animate-pulse bg-gray-100 rounded-lg" />,
});

type Props = {
  projectId: string;
  wikis: WikiSnapshot[];
  setWikis: React.Dispatch<React.SetStateAction<WikiSnapshot[]>>;
  autoOpen?: boolean;
  requestedActiveId?: string | null;
};

function clampTitle(title: string) {
  const t = title.trim();
  return t.length ? t.slice(0, 120) : "Untitled wiki";
}

export default function WikiSidebarPanel({ projectId, wikis, setWikis, autoOpen, requestedActiveId }: Props) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const activeWiki = useMemo(() => wikis.find((w) => w.id === activeId) || null, [activeId, wikis]);

  const [wikiTitle, setWikiTitle] = useState("");
  const [wikiSlug, setWikiSlug] = useState("");
  const [wikiDocHtml, setWikiDocHtml] = useState("");
  const [wikiSaveError, setWikiSaveError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createSlugTouched, setCreateSlugTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCheckingCreateSlug, setIsCheckingCreateSlug] = useState(false);

  useEffect(() => {
    if (!autoOpen) return;
    // open once on mount
    setOpen(true);
  }, [autoOpen]);

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

  const openEditor = () => {
    if (!wikis.length) {
      const id = newId();
      const seed: WikiSnapshot = {
        id,
        source: "inline",
        operation: "create",
        title: "Untitled wiki",
        slug: null,
        doc: "",
        updated_at: new Date().toISOString(),
      };
      setWikis((prev) => [seed, ...prev]);
      setActiveId(id);
    }
    setOpen(true);
  };

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
        <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
          {wikis.slice(0, 8).map((w) => (
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
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={w.title}
              >
                {w.title}
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
          {wikis.length > 8 ? (
            <div style={{ fontSize: "12px", color: "#94a3b8" }}>+{wikis.length - 8} more…</div>
          ) : null}
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
        <div className="p-6 bg-white rounded-3xl dark:bg-gray-900">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs text-gray-500 dark:text-gray-400">Project</div>
              <div className="text-sm font-mono break-all text-gray-700 dark:text-gray-200">{projectId}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={saveWiki} disabled={!activeId}>
                Save
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Wikis</div>
              <div className="flex flex-col gap-2">
                {wikis.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setActiveId(w.id)}
                    className={`text-left rounded-xl border px-3 py-2 text-sm transition ${
                      w.id === activeId
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                        : "border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117]"
                    }`}
                    title={w.title}
                  >
                    <div className="font-medium truncate">{w.title}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{w.id}</div>
                  </button>
                ))}
                <Button size="sm" variant="outline" onClick={openEditor}>
                  + New wiki
                </Button>
              </div>
            </div>

            <div className="lg:col-span-3">
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
                    modules={QUILL_MODULES}
                    className="min-h-[320px]"
                    placeholder="Nhap noi dung wiki..."
                    readOnly={!activeId}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Stored in snapshot_json on commit. This page does not write to DB yet.
          </div>
        </div>
      </Modal>
    </div>
  );
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

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "code-block"],
    ["link", "image"],
    ["clean"],
  ],
};

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
