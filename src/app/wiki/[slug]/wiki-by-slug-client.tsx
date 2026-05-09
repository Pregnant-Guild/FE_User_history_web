"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "react-quill-new/dist/quill.snow.css";

import { ApiError } from "@/uhm/api/http";
import { fetchWikiBySlug, type Wiki } from "@/uhm/api/wikis";

type TocItem = {
  id: string;
  level: number;
  text: string;
};

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

function normalizeWikiContentToHtml(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value.length) return "";

  // New format: HTML string.
  if (value[0] === "<") return value;

  // Legacy format: Tiptap JSON string.
  if (value[0] === "{") {
    try {
      const json: unknown = JSON.parse(value);
      const text = tiptapJsonToPlainText(json).trim();
      if (!text.length) return "";
      return `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`;
    } catch {
      // fall through
    }
  }

  // Unknown plaintext: treat as plain text.
  return `<p>${escapeHtml(value).replace(/\n/g, "<br/>")}</p>`;
}

function slugifyHeading(raw: string): string {
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

function isExternalHref(href: string): boolean {
  const h = href.trim().toLowerCase();
  return (
    h.startsWith("http://") ||
    h.startsWith("https://") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:") ||
    h.startsWith("sms:")
  );
}

function rewriteHtmlAndBuildToc(inputHtml: string, wikiBaseUrl: string): { html: string; toc: TocItem[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(inputHtml, "text/html");

  // Basic hardening: do not render scripts in user content.
  for (const el of Array.from(doc.querySelectorAll("script"))) el.remove();

  // Rewrite internal wiki links: Quill stores slug as <a href="other-wiki-slug">...</a>
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = String(a.getAttribute("href") || "").trim();
    if (!href.length) continue;
    if (href === "__missing__") continue;
    if (href.startsWith("#")) continue;
    if (href.startsWith("/")) continue;
    if (isExternalHref(href)) continue;

    const match = href.match(/^([^?#]+)([?#].*)?$/);
    const slugPart = String(match?.[1] || "").replace(/^\/+/, "").trim();
    const suffix = String(match?.[2] || "");

    const normalizedSlug = slugPart;
    if (!normalizedSlug.length) continue;

    a.setAttribute("href", `${wikiBaseUrl}${encodeURIComponent(normalizedSlug)}${suffix}`);
    a.setAttribute("target", "_self");
  }

  // Build TOC from headings and ensure they have stable IDs.
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  const headings = Array.from(doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6"));
  for (const h of headings) {
    const text = String(h.textContent || "").trim();
    if (!text.length) continue;

    const level = Number(String(h.tagName || "").replace(/^H/i, "")) || 1;
    const existingId = String(h.getAttribute("id") || "").trim();
    if (existingId) {
      toc.push({ id: existingId, level, text });
      continue;
    }

    const base = slugifyHeading(text) || "heading";
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;

    h.setAttribute("id", id);
    toc.push({ id, level, text });
  }

  return { html: doc.body.innerHTML, toc };
}

function formatDate(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString();
}

export default function WikiBySlugClient({ slug }: { slug: string }) {
  const [wiki, setWiki] = useState<Wiki | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [renderHtml, setRenderHtml] = useState<string>("");
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  const normalizedSlug = useMemo(() => String(slug || "").trim(), [slug]);
  const contentRootRef = useRef<HTMLDivElement | null>(null);

  // Load wiki data by slug.
  useEffect(() => {
    const value = String(normalizedSlug || "").trim();
    if (!value.length) {
      setWiki(null);
      setStatus("error");
      setError("Missing wiki slug.");
      return;
    }

    let disposed = false;
    (async () => {
      setStatus("loading");
      setError(null);
      try {
        const res = await fetchWikiBySlug(value);
        if (disposed) return;
        if (!res) {
          setWiki(null);
          setStatus("ready");
          setRenderHtml("");
          setToc([]);
          return;
        }
        setWiki(res);
        setStatus("ready");
      } catch (err) {
        if (disposed) return;
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load wiki.";
        setStatus("error");
        setError(msg);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [normalizedSlug]);

  // Transform content: normalize -> rewrite internal links -> inject heading ids + toc.
  useEffect(() => {
    if (!wiki) {
      setRenderHtml("");
      setToc([]);
      return;
    }

    const raw =
      (wiki.content ?? (wiki as unknown as { doc?: string | null }).doc ?? "") || "";
    const html = normalizeWikiContentToHtml(raw);

    try {
      const base = `${window.location.origin}/wiki/`;
      const processed = rewriteHtmlAndBuildToc(html, base);
      setRenderHtml(processed.html);
      setToc(processed.toc);
      setActiveHeadingId(processed.toc[0]?.id ?? null);
    } catch (err) {
      console.error("Failed to process wiki HTML", err);
      setRenderHtml(html);
      setToc([]);
    }
  }, [wiki]);

  // Track active heading for TOC highlight.
  useEffect(() => {
    if (!toc.length) return;
    const root = contentRootRef.current;
    if (!root) return;

    const headings = toc
      .map((t) => root.querySelector<HTMLElement>(`#${CSS.escape(t.id)}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!headings.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top ?? 0) - (b.boundingClientRect.top ?? 0));
        const top = visible[0]?.target as HTMLElement | undefined;
        const id = top?.id || null;
        if (id) setActiveHeadingId(id);
      },
      { root: null, rootMargin: "-20% 0px -70% 0px", threshold: [0, 1] }
    );

    for (const h of headings) obs.observe(h);
    return () => obs.disconnect();
  }, [toc]);

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 dark:text-gray-400">Wiki</div>
            <h1 className="mt-1 text-2xl font-bold leading-tight break-words">
              {wiki?.title?.trim() || normalizedSlug || "Wiki"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
              <span className="break-all">
                <span className="font-semibold">Slug:</span> {normalizedSlug || "-"}
              </span>
              <span className="break-all">
                <span className="font-semibold">ID:</span> {wiki?.id || "-"}
              </span>
              <span className="break-all">
                <span className="font-semibold">Project:</span>{" "}
                {wiki?.project_id || "-"}
              </span>
              <span>
                <span className="font-semibold">Created:</span> {formatDate(wiki?.created_at)}
              </span>
              <span>
                <span className="font-semibold">Updated:</span> {formatDate(wiki?.updated_at)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="h-9 inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-800 px-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
            >
              Home
            </Link>
          </div>
        </div>

        {status === "loading" ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
            <div className="h-5 w-40 rounded bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="mt-3 h-4 w-2/3 rounded bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
          </div>
        ) : status === "error" ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-6 text-sm text-red-700 dark:text-red-200">
            {error || "Failed to load wiki."}
          </div>
        ) : wiki == null ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-sm text-gray-700 dark:text-gray-200">
            Không tìm thấy wiki với slug: <span className="font-semibold break-all">{normalizedSlug}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-6 self-start rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Mục lục</div>
              {!toc.length ? (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Không có tiêu đề (H1/H2/...).</div>
              ) : (
                <nav className="mt-3 max-h-[70vh] overflow-auto pr-1">
                  <div className="grid gap-1">
                    {toc.map((t) => {
                      const pad = Math.max(0, Math.min(5, t.level - 1)) * 10;
                      const isActive = activeHeadingId === t.id;
                      return (
                        <a
                          key={t.id}
                          href={`#${t.id}`}
                          className={`rounded-md px-2 py-1 text-xs leading-5 transition ${
                            isActive
                              ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                              : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.04]"
                          }`}
                          style={{ paddingLeft: 8 + pad }}
                          title={t.text}
                        >
                          {t.text}
                        </a>
                      );
                    })}
                  </div>
                </nav>
              )}

              <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-3">
                <div className="text-[11px] text-gray-500 dark:text-gray-400 break-all">
                  Link: {`${typeof window !== "undefined" ? window.location.origin : ""}/wiki/${normalizedSlug}`}
                </div>
              </div>
            </aside>

            <main className="min-w-0">
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                <div
                  ref={contentRootRef}
                  className="uhm-wiki-view ql-editor text-sm text-gray-900 dark:text-gray-100"
                  dangerouslySetInnerHTML={{ __html: renderHtml }}
                />
              </div>
            </main>
          </div>
        )}
      </div>

      <style jsx global>{`
        /* Quill view container tweaks: allow page-level scrolling instead of inner scroll. */
        .uhm-wiki-view.ql-editor {
          height: auto;
          overflow-y: visible;
          padding: 18px 20px;
        }
        /* Improve readability for view mode (Quill resets block margins to 0). */
        .uhm-wiki-view.ql-editor p {
          margin: 0 0 0.75em;
        }
        .uhm-wiki-view.ql-editor h1 {
          margin: 1.25em 0 0.6em;
          font-size: 1.9em;
          font-weight: 800;
          line-height: 1.2;
        }
        .uhm-wiki-view.ql-editor h2 {
          margin: 1.15em 0 0.55em;
          font-size: 1.55em;
          font-weight: 800;
          line-height: 1.25;
        }
        .uhm-wiki-view.ql-editor h3 {
          margin: 1.05em 0 0.5em;
          font-size: 1.25em;
          font-weight: 700;
          line-height: 1.3;
        }
        .uhm-wiki-view.ql-editor h4,
        .uhm-wiki-view.ql-editor h5,
        .uhm-wiki-view.ql-editor h6 {
          margin: 0.95em 0 0.45em;
          font-size: 1.05em;
          font-weight: 700;
          line-height: 1.35;
        }
        .uhm-wiki-view.ql-editor ul,
        .uhm-wiki-view.ql-editor ol {
          margin: 0 0 0.75em;
          padding-left: 1.5em;
        }
        .uhm-wiki-view.ql-editor blockquote {
          margin: 0 0 0.75em;
          padding-left: 12px;
          border-left: 3px solid rgba(148, 163, 184, 0.6);
          color: rgba(71, 85, 105, 1);
        }
        :is(.dark *) .uhm-wiki-view.ql-editor blockquote {
          border-left-color: rgba(100, 116, 139, 0.6);
          color: rgba(203, 213, 225, 0.95);
        }
        .uhm-wiki-view.ql-editor pre {
          margin: 0 0 0.75em;
          padding: 12px 14px;
          border: 1px solid rgba(226, 232, 240, 1);
          border-radius: 10px;
          background: rgba(248, 250, 252, 1);
          overflow: auto;
        }
        :is(.dark *) .uhm-wiki-view.ql-editor pre {
          border-color: rgba(51, 65, 85, 1);
          background: rgba(2, 6, 23, 0.4);
        }
        .uhm-wiki-view.ql-editor img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }
        .uhm-wiki-view.ql-editor h1,
        .uhm-wiki-view.ql-editor h2,
        .uhm-wiki-view.ql-editor h3,
        .uhm-wiki-view.ql-editor h4,
        .uhm-wiki-view.ql-editor h5,
        .uhm-wiki-view.ql-editor h6 {
          scroll-margin-top: 16px;
        }
        .uhm-wiki-view.ql-editor a {
          text-decoration: underline;
          text-decoration-thickness: from-font;
          text-underline-offset: 2px;
        }
        .uhm-wiki-view.ql-editor a[href]:not([href=""]) {
          color: #2563eb;
        }
        :is(.dark *) .uhm-wiki-view.ql-editor a[href]:not([href=""]) {
          color: #60a5fa;
        }
        .uhm-wiki-view.ql-editor a[href="__missing__"] {
          cursor: default;
          pointer-events: none;
        }
        .uhm-wiki-view.ql-editor a:not([href]),
        .uhm-wiki-view.ql-editor a[href=""],
        .uhm-wiki-view.ql-editor a[href="__missing__"] {
          color: #dc2626;
        }
        :is(.dark *) .uhm-wiki-view.ql-editor a:not([href]),
        :is(.dark *) .uhm-wiki-view.ql-editor a[href=""],
        :is(.dark *) .uhm-wiki-view.ql-editor a[href="__missing__"] {
          color: #f87171;
        }
      `}</style>
    </div>
  );
}
