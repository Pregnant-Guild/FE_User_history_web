"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import { searchWikisByTitle, type Wiki } from "@/uhm/api/wikis";

import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import Label from "@/components/form/Label";

import type { WikiSnapshot } from "@/uhm/types/wiki";
import { newId } from "@/uhm/lib/id";

type Props = {
  projectId: string;
  wikis: WikiSnapshot[];
  setWikis: React.Dispatch<React.SetStateAction<WikiSnapshot[]>>;
  autoOpen?: boolean;
};

function clampTitle(title: string) {
  const t = title.trim();
  return t.length ? t.slice(0, 120) : "Untitled wiki";
}

export default function WikiSidebarPanel({ projectId, wikis, setWikis, autoOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeWiki = useMemo(() => wikis.find((w) => w.id === activeId) || null, [activeId, wikis]);

  const [wikiTitle, setWikiTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Wiki[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRequestRef = useState(() => ({ id: 0 }))[0];

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
    ],
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }] },
    editorProps: {
      attributes: {
        class: "tiptap-editor focus:outline-none min-h-[320px] px-4 py-3",
      },
    },
  });

  useEffect(() => {
    if (!autoOpen) return;
    // open once on mount
    setOpen(true);
  }, [autoOpen]);

  // keep editor content in sync when switching wiki
  useEffect(() => {
    if (!editor) return;
    if (!open) return;

    const doc = (activeWiki?.doc || null) as JSONContent | null;
    editor.commands.setContent(
      (doc && typeof doc === "object" ? doc : { type: "doc", content: [{ type: "paragraph" }] }) as any
    );
    setWikiTitle(activeWiki?.title || "");
  }, [activeWiki?.doc, activeWiki?.title, editor, open]);

  const ensureActive = () => {
    if (activeId && wikis.some((w) => w.id === activeId)) return;
    setActiveId(wikis[0]?.id || null);
  };

  useEffect(() => {
    ensureActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wikis.length]);

  useEffect(() => {
    const keyword = searchQuery.trim();
    if (!keyword.length) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let disposed = false;
    const requestId = ++searchRequestRef.id;
    const t = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const rows = await searchWikisByTitle(keyword, { limit: 12 });
        if (disposed || requestId !== searchRequestRef.id) return;
        setSearchResults(rows);
      } catch (err) {
        if (disposed || requestId !== searchRequestRef.id) return;
        console.error("Search wikis failed", err);
        setSearchResults([]);
      } finally {
        if (disposed || requestId !== searchRequestRef.id) return;
        setIsSearching(false);
      }
    }, 250);

    return () => {
      disposed = true;
      window.clearTimeout(t);
    };
  }, [searchQuery, searchRequestRef]);

  const addWikiRef = (wiki: Wiki) => {
    const id = String(wiki.id || "").trim();
    if (!id) return;
    if (wikis.some((w) => w.id === id)) {
      setActiveId(id);
      return;
    }
    const title = (wiki.title || "").trim() || "Untitled wiki";
    setWikis((prev) => [
      {
        id,
        source: "ref",
        operation: "reference",
        title,
        doc: null,
        updated_at: wiki.updated_at,
      },
      ...prev,
    ]);
    setActiveId(id);
  };

  const openEditor = () => {
    if (!wikis.length) {
      const id = newId();
      const seed: WikiSnapshot = {
        id,
        source: "inline",
        operation: "create",
        title: "Untitled wiki",
        doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }] },
        updated_at: new Date().toISOString(),
      };
      setWikis((prev) => [seed, ...prev]);
      setActiveId(id);
    }
    setOpen(true);
  };

  const createWiki = () => {
    const id = newId();
    const next: WikiSnapshot = {
      id,
      source: "inline",
      operation: "create",
      title: "Untitled wiki",
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }] },
      updated_at: new Date().toISOString(),
    };
    setWikis((prev) => [next, ...prev]);
    setActiveId(id);
    setOpen(true);
  };

  const removeWiki = (id: string) => {
    setWikis((prev) => prev.filter((w) => w.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const saveWiki = () => {
    if (!editor || !activeId) return;
    const payload = editor.getJSON();
    const nextTitle = clampTitle(wikiTitle);
    setWikis((prev) =>
          prev.map((w) =>
            w.id !== activeId
              ? w
              : {
                  ...w,
                  source: w.source,
                  operation: w.operation === "create" ? "create" : "update",
                  title: nextTitle,
                  doc: payload,
                  updated_at: new Date().toISOString(),
            }
      )
    );
    setOpen(false);
  };

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link")?.href as string | undefined;
    const href = window.prompt("Link URL", prev || "https://");
    if (href == null) return;
    const next = href.trim();
    if (!next.length) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: next }).run();
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
      <style jsx global>{`
        .tiptap-editor p {
          margin: 0.5rem 0;
          line-height: 1.65;
          font-size: 0.95rem;
        }
        .tiptap-editor h1 {
          margin: 1rem 0 0.5rem;
          font-size: 1.5rem;
          font-weight: 800;
          line-height: 1.25;
        }
        .tiptap-editor h2 {
          margin: 0.9rem 0 0.4rem;
          font-size: 1.25rem;
          font-weight: 700;
          line-height: 1.3;
        }
        .tiptap-editor h3 {
          margin: 0.8rem 0 0.35rem;
          font-size: 1.1rem;
          font-weight: 700;
          line-height: 1.35;
        }
        .tiptap-editor ul,
        .tiptap-editor ol {
          margin: 0.6rem 0;
          padding-left: 1.25rem;
        }
        .tiptap-editor li {
          margin: 0.2rem 0;
        }
        .tiptap-editor blockquote {
          margin: 0.75rem 0;
          padding-left: 0.75rem;
          border-left: 4px solid rgba(148, 163, 184, 0.55);
          color: rgba(100, 116, 139, 1);
        }
        .dark .tiptap-editor blockquote {
          border-left-color: rgba(71, 85, 105, 1);
          color: rgba(148, 163, 184, 1);
        }
        .tiptap-editor code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          font-size: 0.85em;
          padding: 0.1rem 0.25rem;
          border-radius: 0.35rem;
          background: rgba(148, 163, 184, 0.15);
        }
        .tiptap-editor pre {
          margin: 0.8rem 0;
          padding: 0.9rem 1rem;
          border-radius: 0.75rem;
          border: 1px solid rgba(226, 232, 240, 1);
          background: rgba(248, 250, 252, 1);
          overflow: auto;
        }
        .dark .tiptap-editor pre {
          border-color: rgba(30, 41, 59, 1);
          background: rgba(13, 17, 23, 1);
        }
        .tiptap-editor pre code {
          background: transparent;
          padding: 0;
        }
        .tiptap-editor a {
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ fontWeight: 700, fontSize: "14px" }}>Wiki</div>
        <Badge size="sm" variant="light" color="info">
          {wikis.length}
        </Badge>
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <button
          type="button"
          onClick={openEditor}
          style={{
            flex: 1,
            border: "none",
            borderRadius: "6px",
            padding: "8px",
            cursor: "pointer",
            background: "#2563eb",
            color: "white",
            fontWeight: 700,
          }}
        >
          Open wiki editor
        </button>
        <button
          type="button"
          onClick={createWiki}
          title="New wiki"
          style={{
            width: "42px",
            border: "none",
            borderRadius: "6px",
            padding: "8px",
            cursor: "pointer",
            background: "#1f2937",
            color: "white",
            fontWeight: 900,
          }}
        >
          +
        </button>
      </div>

      <div style={{ marginTop: "10px" }}>
        <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>Add existing wiki</div>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title…"
          style={{
            width: "100%",
            border: "1px solid #1f2937",
            background: "#0b1220",
            color: "#e5e7eb",
            borderRadius: "6px",
            padding: "8px 10px",
            fontSize: "12px",
            outline: "none",
          }}
        />
        {isSearching ? (
          <div style={{ marginTop: "6px", fontSize: "12px", color: "#94a3b8" }}>Searching…</div>
        ) : null}
        {!isSearching && searchQuery.trim().length > 0 ? (
          <div style={{ marginTop: "6px", display: "grid", gap: "6px" }}>
            {searchResults.slice(0, 8).map((w) => (
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#e5e7eb", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {(w.title || "").trim() || "Untitled wiki"}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {w.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => addWikiRef(w)}
                  style={{
                    border: "none",
                    background: "#111827",
                    color: "#93c5fd",
                    cursor: "pointer",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    fontSize: "12px",
                    fontWeight: 700,
                    flex: "0 0 auto",
                  }}
                >
                  Add
                </button>
              </div>
            ))}
            {!searchResults.length ? (
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>No results.</div>
            ) : null}
          </div>
        ) : null}
      </div>

      {wikis.length ? (
        <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
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
                background: w.id === activeId ? "#111827" : "transparent",
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
              <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={saveWiki} disabled={!editor || !activeId}>
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
                <Button size="sm" variant="outline" onClick={createWiki}>
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

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBold().run()} disabled={!editor}>
                    B
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleItalic().run()} disabled={!editor}>
                    I
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} disabled={!editor}>
                    H1
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} disabled={!editor}>
                    H2
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} disabled={!editor}>
                    H3
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBulletList().run()} disabled={!editor}>
                    Bullets
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleOrderedList().run()} disabled={!editor}>
                    Numbers
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBlockquote().run()} disabled={!editor}>
                    Quote
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} disabled={!editor}>
                    Code
                  </Button>
                  <Button size="sm" variant="outline" onClick={setLink} disabled={!editor}>
                    Link
                  </Button>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117]">
                  {editor ? <EditorContent editor={editor} /> : <div className="p-4 text-sm text-gray-500">Loading editor...</div>}
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
