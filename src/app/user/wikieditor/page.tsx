"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import Label from "@/components/form/Label";

import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";

const STORAGE_KEY = "uhm_wiki_draft_v1";

type TocItem = {
  level: number;
  text: string;
  slug: string;
};

type WikiDraft = {
  schema_version: 1;
  title: string;
  doc: JSONContent;
  updated_at: string;
};

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function textFromNode(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (Array.isArray(node.content)) return node.content.map(textFromNode).join("");
  return "";
}

function buildToc(doc: JSONContent | null): TocItem[] {
  if (!doc) return [];
  const out: TocItem[] = [];
  const seen = new Map<string, number>();

  const walk = (node: any) => {
    if (!node) return;
    if (node.type === "heading") {
      const level = Number(node.attrs?.level || 1);
      const text = textFromNode(node).trim();
      if (text) {
        const base = slugify(text) || "heading";
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        const slug = n === 1 ? base : `${base}-${n}`;
        out.push({ level, text, slug });
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };

  walk(doc);
  return out;
}

function renderInlineText(node: any, key: string) {
  if (node.type !== "text") return null;
  const marks: any[] = Array.isArray(node.marks) ? node.marks : [];
  let el: React.ReactNode = node.text || "";

  for (const m of marks) {
    if (m.type === "bold") el = <strong key={`${key}-b`}>{el}</strong>;
    else if (m.type === "italic") el = <em key={`${key}-i`}>{el}</em>;
    else if (m.type === "link") {
      const href = String(m.attrs?.href || "#");
      el = (
        <a
          key={`${key}-a`}
          href={href}
          target={m.attrs?.target || "_blank"}
          rel="noreferrer"
          className="text-brand-600 dark:text-brand-400 underline underline-offset-2"
        >
          {el}
        </a>
      );
    }
  }

  return <span key={key}>{el}</span>;
}

function renderDoc(node: any, keyPrefix = "n", toc: TocItem[] = []) : React.ReactNode {
  if (!node) return null;
  const type = node.type;
  const content: any[] = Array.isArray(node.content) ? node.content : [];

  if (type === "doc") {
    return <>{content.map((c, i) => renderDoc(c, `${keyPrefix}.${i}`, toc))}</>;
  }

  if (type === "paragraph") {
    return (
      <p key={keyPrefix} className="text-sm leading-6 text-gray-800 dark:text-gray-200">
        {content.map((c, i) => renderDoc(c, `${keyPrefix}.${i}`, toc))}
      </p>
    );
  }

  if (type === "heading") {
    const level = Number(node.attrs?.level || 1);
    const text = textFromNode(node).trim();
    const slug = toc.find((t) => t.text === text)?.slug || slugify(text);
    const cls =
      level === 1
        ? "text-2xl font-bold"
        : level === 2
          ? "text-xl font-semibold"
          : "text-lg font-semibold";
    return (
      <div key={keyPrefix} className="mt-5">
        <div id={slug} className={`${cls} text-gray-900 dark:text-gray-100`}>
          {content.map((c, i) => renderDoc(c, `${keyPrefix}.${i}`, toc))}
        </div>
      </div>
    );
  }

  if (type === "bulletList") {
    return (
      <ul key={keyPrefix} className="list-disc pl-5 text-sm text-gray-800 dark:text-gray-200">
        {content.map((c, i) => renderDoc(c, `${keyPrefix}.${i}`, toc))}
      </ul>
    );
  }

  if (type === "orderedList") {
    return (
      <ol key={keyPrefix} className="list-decimal pl-5 text-sm text-gray-800 dark:text-gray-200">
        {content.map((c, i) => renderDoc(c, `${keyPrefix}.${i}`, toc))}
      </ol>
    );
  }

  if (type === "listItem") {
    return <li key={keyPrefix}>{content.map((c, i) => renderDoc(c, `${keyPrefix}.${i}`, toc))}</li>;
  }

  if (type === "blockquote") {
    return (
      <blockquote
        key={keyPrefix}
        className="border-l-4 border-gray-200 dark:border-gray-800 pl-4 text-sm text-gray-700 dark:text-gray-300"
      >
        {content.map((c, i) => renderDoc(c, `${keyPrefix}.${i}`, toc))}
      </blockquote>
    );
  }

  if (type === "codeBlock") {
    const code = content.map(textFromNode).join("");
    return (
      <pre
        key={keyPrefix}
        className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#0d1117] p-4 overflow-auto text-xs"
      >
        <code>{code}</code>
      </pre>
    );
  }

  if (type === "hardBreak") return <br key={keyPrefix} />;

  if (type === "text") return renderInlineText(node, keyPrefix);

  // fallback: render children
  return <span key={keyPrefix}>{content.map((c, i) => renderDoc(c, `${keyPrefix}.${i}`, toc))}</span>;
}

type ViewMode = "edit" | "split" | "preview";

export default function WikiEditorPage() {
  const [view, setView] = useState<ViewMode>("split");
  const [showJson, setShowJson] = useState(false);
  const [title, setTitle] = useState("Untitled wiki");
  const [docJson, setDocJson] = useState<JSONContent | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

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
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Write your wiki content here." }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section" }] },
        { type: "paragraph", content: [{ type: "text", text: "Use H1/H2/H3 and the TOC will follow." }] },
      ],
    },
    onUpdate: ({ editor }) => {
      setDocJson(editor.getJSON());
      setIsDirty(true);
    },
    editorProps: {
      attributes: {
        // Keep editor styling independent from whatever global typography the app uses.
        class:
          "tiptap-editor focus:outline-none min-h-[360px] px-4 py-3",
      },
    },
  });

  // Load draft
  useEffect(() => {
    if (!editor) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as WikiDraft;
      if (parsed && typeof parsed === "object" && parsed.schema_version === 1 && parsed.doc) {
        setTitle(parsed.title || "Untitled wiki");
        editor.commands.setContent(parsed.doc as JSONContent);
        setDocJson(parsed.doc as JSONContent);
        setSavedAt(parsed.updated_at || "loaded");
        setIsDirty(false);
      }
    } catch {
      // ignore
    }
  }, [editor]);

  const toc = useMemo(() => buildToc(docJson), [docJson]);

  const doSaveDraft = () => {
    if (!editor) return;
    const payload: WikiDraft = {
      schema_version: 1,
      title: title.trim() || "Untitled wiki",
      doc: editor.getJSON(),
      updated_at: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setSavedAt(new Date().toLocaleString("vi-VN"));
    setIsDirty(false);
  };

  // Debounced autosave
  useEffect(() => {
    if (!editor) return;
    if (!isDirty) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      doSaveDraft();
    }, 1000);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isDirty, title, docJson]);

  const can = (cmd: () => boolean) => {
    try {
      return Boolean(editor && cmd());
    } catch {
      return false;
    }
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
    <div className="max-w-7xl mx-auto pb-10">
      <PageBreadcrumb pageTitle="Wiki editor" paths={[{ name: "User", href: "/user" }]} />

      <style jsx global>{`
        .tiptap-editor {
          color: inherit;
        }
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
        .tiptap-editor hr {
          margin: 1rem 0;
          border: none;
          border-top: 1px solid rgba(226, 232, 240, 1);
        }
        .dark .tiptap-editor hr {
          border-top-color: rgba(30, 41, 59, 1);
        }
      `}</style>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <ComponentCard title="Wiki">
          <div className="p-4 flex flex-col gap-4">
            <div>
              <Label>Title</Label>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setIsDirty(true);
                }}
                className="h-11 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
                placeholder="Wiki title"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge size="sm" variant="light" color="info">
                  TipTap
                </Badge>
                {isDirty ? (
                  <Badge size="sm" variant="light" color="warning">
                    Unsaved
                  </Badge>
                ) : (
                  <Badge size="sm" variant="light" color="success">
                    Saved
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowJson((v) => !v)}>
                {showJson ? "Hide JSON" : "Show JSON"}
              </Button>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400">
              Last save: {savedAt || "-"}
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">TOC</div>
              {toc.length === 0 ? (
                <div className="text-xs text-gray-500 dark:text-gray-400">No headings</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {toc.map((t) => (
                    <Link
                      key={t.slug}
                      href={`#${t.slug}`}
                      className={`text-xs hover:underline text-gray-700 dark:text-gray-300 ${
                        t.level === 1 ? "font-semibold" : t.level === 2 ? "pl-3" : "pl-6"
                      }`}
                      title={t.text}
                    >
                      {t.text}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-1 flex gap-2">
              <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={doSaveDraft} disabled={!editor}>
                Save now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  window.localStorage.removeItem(STORAGE_KEY);
                  setSavedAt(null);
                  setIsDirty(false);
                }}
              >
                Clear draft
              </Button>
            </div>
          </div>
        </ComponentCard>

        <div className="lg:col-span-3 flex flex-col gap-6">
          <ComponentCard title="Editor">
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => setView("edit")}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setView("split")}>
                  Split
                </Button>
                <Button size="sm" variant="outline" onClick={() => setView("preview")}>
                  Preview
                </Button>

                <div className="w-px h-7 bg-gray-200 dark:bg-gray-800 mx-1" />

                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBold().run()} disabled={!can(() => editor!.can().toggleBold())}>
                  B
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleItalic().run()} disabled={!can(() => editor!.can().toggleItalic())}>
                  I
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
                  H1
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
                  H2
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
                  H3
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                  Bullets
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                  Numbers
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
                  Quote
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
                  Code
                </Button>
                <Button size="sm" variant="outline" onClick={setLink} disabled={!editor}>
                  Link
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().undo().run()} disabled={!can(() => editor!.can().undo())}>
                  Undo
                </Button>
                <Button size="sm" variant="outline" onClick={() => editor?.chain().focus().redo().run()} disabled={!can(() => editor!.can().redo())}>
                  Redo
                </Button>
              </div>

              <div className={view === "split" ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : ""}>
                {view !== "preview" ? (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117]">
                    {editor ? <EditorContent editor={editor} /> : <div className="p-4 text-sm text-gray-500">Loading editor...</div>}
                  </div>
                ) : null}

                {view !== "edit" ? (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117] p-4">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                      Preview
                    </div>
                    {renderDoc(docJson, "p", toc)}
                  </div>
                ) : null}
              </div>
            </div>
          </ComponentCard>

          {showJson ? (
            <ComponentCard title="Document JSON">
              <div className="p-4">
                <pre className="text-xs whitespace-pre-wrap break-words rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117] p-4 overflow-auto max-h-[520px]">
                  {JSON.stringify({ title: title.trim() || "Untitled wiki", doc: docJson }, null, 2)}
                </pre>
              </div>
            </ComponentCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
