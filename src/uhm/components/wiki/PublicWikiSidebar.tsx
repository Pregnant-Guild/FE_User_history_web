"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Entity } from "@/uhm/api/entities";
import type { Wiki } from "@/uhm/api/wikis";

type TocItem = {
    id: string;
    level: number;
    text: string;
};

type Props = {
    entity: Entity | null;
    wiki: Wiki | null;
    isLoading: boolean;
    error?: string | null;
    onClose: () => void;
    onWikiLinkRequest: (request: { slug: string; rect: DOMRect }) => void;
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

    if (value[0] === "<") return value;

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

function prepareWikiHtml(inputHtml: string): { html: string; toc: TocItem[] } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(inputHtml, "text/html");

    for (const el of Array.from(doc.querySelectorAll("script"))) el.remove();

    for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
        const href = String(a.getAttribute("href") || "").trim();
        if (!href.length) continue;
        if (href === "__missing__") continue;
        if (href.startsWith("#")) continue;
        if (href.startsWith("/")) continue;

        if (isExternalHref(href)) {
            a.setAttribute("target", "_blank");
            a.setAttribute("rel", "noopener noreferrer");
            continue;
        }

        const match = href.match(/^([^?#]+)([?#].*)?$/);
        const slugPart = String(match?.[1] || "").replace(/^\/+/, "").trim();
        if (!slugPart.length) continue;
        a.setAttribute("href", `#wiki:${slugPart}`);
        a.setAttribute("data-wiki-slug", slugPart);
        a.setAttribute("target", "_self");
    }

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
        const nextCount = (seen.get(base) || 0) + 1;
        seen.set(base, nextCount);
        const id = nextCount === 1 ? base : `${base}-${nextCount}`;

        h.setAttribute("id", id);
        toc.push({ id, level, text });
    }

    return { html: doc.body.innerHTML, toc };
}

export default function PublicWikiSidebar({
    entity,
    wiki,
    isLoading,
    error,
    onClose,
    onWikiLinkRequest,
}: Props) {
    const contentRootRef = useRef<HTMLDivElement | null>(null);
    const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
    const processedWiki = useMemo(() => {
        if (!wiki) return { html: "", toc: [] as TocItem[] };

        const html = normalizeWikiContentToHtml(wiki.content ?? "");
        try {
            return prepareWikiHtml(html);
        } catch (err) {
            console.error("Failed to process sidebar wiki HTML", err);
            return { html, toc: [] as TocItem[] };
        }
    }, [wiki]);
    const renderHtml = processedWiki.html;
    const toc = processedWiki.toc;
    const effectiveActiveHeadingId = toc.some((item) => item.id === activeHeadingId)
        ? activeHeadingId
        : (toc[0]?.id ?? null);

    useEffect(() => {
        if (!toc.length) return;
        const root = contentRootRef.current;
        if (!root) return;

        const headings = toc
            .map((item) => root.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`))
            .filter((item): item is HTMLElement => Boolean(item));
        if (!headings.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => (a.boundingClientRect.top ?? 0) - (b.boundingClientRect.top ?? 0));
                const top = visible[0]?.target as HTMLElement | undefined;
                if (top?.id) setActiveHeadingId(top.id);
            },
            { root: null, rootMargin: "-18% 0px -70% 0px", threshold: [0, 1] }
        );

        for (const heading of headings) observer.observe(heading);
        return () => observer.disconnect();
    }, [toc]);

    useEffect(() => {
        const root = contentRootRef.current;
        if (!root) return;

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            const link = target?.closest?.("a[data-wiki-slug]") as HTMLAnchorElement | null;
            if (!link) return;
            event.preventDefault();

            const slug = String(link.getAttribute("data-wiki-slug") || "").trim();
            if (!slug.length) return;
            onWikiLinkRequest({ slug, rect: link.getBoundingClientRect() });
        };

        root.addEventListener("click", handleClick);
        return () => root.removeEventListener("click", handleClick);
    }, [onWikiLinkRequest, renderHtml]);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                            Wiki
                        </div>
                        <div className="mt-1 text-lg font-semibold leading-tight text-gray-900 dark:text-gray-100">
                            {entity?.name?.trim() || wiki?.title?.trim() || "Wiki"}
                        </div>
                        {entity?.description?.trim() ? (
                            <div className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                                {entity.description.trim()}
                            </div>
                        ) : null}
                        {wiki?.title?.trim() && wiki.title.trim() !== entity?.name?.trim() ? (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {wiki.title.trim()}
                            </div>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-sm text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-100"
                        aria-label="Close wiki sidebar"
                    >
                        x
                    </button>
                </div>
            </div>

            {toc.length ? (
                <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {toc.slice(0, 8).map((item) => {
                            const isActive = effectiveActiveHeadingId === item.id;
                            return (
                                <a
                                    key={item.id}
                                    href={`#${item.id}`}
                                    className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${isActive
                                            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                                            : "bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]"
                                        }`}
                                >
                                    {item.text}
                                </a>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="space-y-3 px-4 py-4">
                        <div className="h-4 w-28 animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
                        <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
                        <div className="h-4 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
                    </div>
                ) : error ? (
                    <div className="px-4 py-4 text-sm text-red-600 dark:text-red-300">
                        {error}
                    </div>
                ) : wiki ? (
                    <div
                        ref={contentRootRef}
                        className="uhm-wiki-sidebar-view ql-editor text-sm text-gray-900 dark:text-gray-100"
                        dangerouslySetInnerHTML={{ __html: renderHtml }}
                    />
                ) : (
                    <div className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                        Entity này chưa có wiki liên kết.
                    </div>
                )}
            </div>

            <style jsx global>{`
                .uhm-wiki-sidebar-view.ql-editor {
                    height: auto;
                    overflow-y: visible;
                    padding: 18px 18px 22px;
                }
                .uhm-wiki-sidebar-view.ql-editor p {
                    margin: 0 0 0.75em;
                }
                .uhm-wiki-sidebar-view.ql-editor h1 {
                    margin: 1.15em 0 0.6em;
                    font-size: 1.6em;
                    font-weight: 800;
                    line-height: 1.2;
                }
                .uhm-wiki-sidebar-view.ql-editor h2 {
                    margin: 1.05em 0 0.55em;
                    font-size: 1.3em;
                    font-weight: 800;
                    line-height: 1.25;
                }
                .uhm-wiki-sidebar-view.ql-editor h3,
                .uhm-wiki-sidebar-view.ql-editor h4,
                .uhm-wiki-sidebar-view.ql-editor h5,
                .uhm-wiki-sidebar-view.ql-editor h6 {
                    margin: 0.95em 0 0.45em;
                    font-size: 1.05em;
                    font-weight: 700;
                    line-height: 1.3;
                }
                .uhm-wiki-sidebar-view.ql-editor ul,
                .uhm-wiki-sidebar-view.ql-editor ol {
                    margin: 0 0 0.75em;
                    padding-left: 1.5em;
                }
                .uhm-wiki-sidebar-view.ql-editor blockquote {
                    margin: 0 0 0.75em;
                    padding-left: 12px;
                    border-left: 3px solid rgba(148, 163, 184, 0.6);
                    color: rgba(71, 85, 105, 1);
                }
                :is(.dark *) .uhm-wiki-sidebar-view.ql-editor blockquote {
                    border-left-color: rgba(100, 116, 139, 0.6);
                    color: rgba(203, 213, 225, 0.95);
                }
                .uhm-wiki-sidebar-view.ql-editor pre {
                    margin: 0 0 0.75em;
                    padding: 12px 14px;
                    border: 1px solid rgba(226, 232, 240, 1);
                    border-radius: 10px;
                    background: rgba(248, 250, 252, 1);
                    overflow: auto;
                }
                :is(.dark *) .uhm-wiki-sidebar-view.ql-editor pre {
                    border-color: rgba(51, 65, 85, 1);
                    background: rgba(2, 6, 23, 0.4);
                }
                .uhm-wiki-sidebar-view.ql-editor img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                }
                .uhm-wiki-sidebar-view.ql-editor a {
                    text-decoration: underline;
                    text-underline-offset: 2px;
                }
                .uhm-wiki-sidebar-view.ql-editor a[href]:not([href=""]):not([href="__missing__"]) {
                    color: #2563eb;
                }
                :is(.dark *) .uhm-wiki-sidebar-view.ql-editor a[href]:not([href=""]):not([href="__missing__"]) {
                    color: #60a5fa;
                }
                .uhm-wiki-sidebar-view.ql-editor a[href="__missing__"] {
                    cursor: default;
                    pointer-events: none;
                }
                .uhm-wiki-sidebar-view.ql-editor a:not([href]),
                .uhm-wiki-sidebar-view.ql-editor a[href=""],
                .uhm-wiki-sidebar-view.ql-editor a[href="__missing__"] {
                    color: #dc2626;
                }
                :is(.dark *) .uhm-wiki-sidebar-view.ql-editor a:not([href]),
                :is(.dark *) .uhm-wiki-sidebar-view.ql-editor a[href=""],
                :is(.dark *) .uhm-wiki-sidebar-view.ql-editor a[href="__missing__"] {
                    color: #f87171;
                }
            `}</style>
        </div>
    );
}
