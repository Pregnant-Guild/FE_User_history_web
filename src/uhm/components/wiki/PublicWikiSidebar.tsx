"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "react-quill-new/dist/quill.snow.css";

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
    sidebarWidth?: number;
    onSidebarWidthChange?: (width: number) => void;
    maxDragWidth?: number;
};

function escapeHtml(input: string): string {
    return input
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeWikiContentToHtml(raw: string | null | undefined): string {
    let value = String(raw || "").trim();
    if (!value.length) return "";

    // Replace non-breaking spaces to allow text wrap
    value = value.replaceAll("&nbsp;", " ").replaceAll("\u00a0", " ");

    if (value[0] === "<") return value;

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
    sidebarWidth,
    onSidebarWidthChange,
    maxDragWidth,
}: Props) {
    const contentRootRef = useRef<HTMLDivElement | null>(null);
    const tocContainerRef = useRef<HTMLDivElement | null>(null);

    const [localWidth, setLocalWidth] = useState<number>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("public-wiki-sidebar-width");
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (!isNaN(parsed) && parsed >= 320 && parsed <= 800) {
                    return parsed;
                }
            }
        }
        return 420;
    });

    const width = sidebarWidth ?? localWidth;
    const setWidth = onSidebarWidthChange ?? setLocalWidth;
    const maxDragWidthLimit = maxDragWidth ?? 800;

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;

        const onMove = (e: PointerEvent) => {
            const deltaX = e.clientX - startX;
            const nextWidth = Math.max(320, Math.min(maxDragWidthLimit, startWidth - deltaX));
            setWidth(nextWidth);
            if (typeof window !== "undefined") {
                localStorage.setItem("public-wiki-sidebar-width", String(nextWidth));
            }
        };

        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

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

        const scrollContainer = root.parentElement;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => (a.boundingClientRect.top ?? 0) - (b.boundingClientRect.top ?? 0));
                const top = visible[0]?.target as HTMLElement | undefined;
                if (top?.id) setActiveHeadingId(top.id);
            },
            { root: scrollContainer || null, rootMargin: "-18% 0px -70% 0px", threshold: [0, 1] }
        );

        for (const heading of headings) observer.observe(heading);
        return () => observer.disconnect();
    }, [toc]);

    useEffect(() => {
        const container = tocContainerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                container.scrollLeft += e.deltaY;
            }
        };

        container.addEventListener("wheel", handleWheel, { passive: false });
        return () => {
            container.removeEventListener("wheel", handleWheel);
        };
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
        <div
            style={{
                width: `${width}px`,
                display: "flex",
                flexDirection: "column",
                height: "100%",
                minHeight: 0,
                overflow: "hidden",
                borderRadius: 20,
                border: "1px solid rgba(148, 163, 184, 0.22)",
                background: "linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))",
                boxShadow: "0 20px 48px rgba(2, 6, 23, 0.45)",
                backdropFilter: "blur(12px)",
                position: "relative",
            }}
        >
            {/* Drag Handle on the left edge */}
            <div
                onPointerDown={handlePointerDown}
                style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 6,
                    cursor: "col-resize",
                    zIndex: 50,
                    userSelect: "none",
                }}
                className="group"
                title="Kéo để chỉnh kích thước"
            >
                {/* Visual drag line overlay */}
                <div
                    style={{
                        position: "absolute",
                        left: 2,
                        top: 0,
                        bottom: 0,
                        width: 2,
                        background: "transparent",
                        transition: "background-color 0.2s",
                    }}
                    className="group-hover:bg-sky-500/50 group-active:bg-sky-500"
                />
            </div>
            <div
                style={{
                    borderBottom: "1px solid rgba(148, 163, 184, 0.15)",
                    padding: "16px",
                }}
            >
                <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                            style={{
                                fontSize: 10,
                                textTransform: "uppercase",
                                letterSpacing: "1.2px",
                                fontWeight: 900,
                                color: "#94a3b8",
                            }}
                        >
                            Wiki
                        </div>
                        <div
                            style={{
                                marginTop: 4,
                                fontSize: 18,
                                fontWeight: 700,
                                lineHeight: 1.3,
                                color: "#f8fafc",
                            }}
                        >
                            {entity?.name?.trim() || wiki?.title?.trim() || "Wiki"}
                        </div>
                        {entity?.description?.trim() ? (
                            <div
                                style={{
                                    marginTop: 8,
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    color: "#cbd5e1",
                                }}
                            >
                                {entity.description.trim()}
                            </div>
                        ) : null}
                        {wiki?.title?.trim() && wiki.title.trim() !== entity?.name?.trim() ? (
                            <div
                                style={{
                                    marginTop: 6,
                                    fontSize: 12,
                                    color: "#94a3b8",
                                }}
                            >
                                {wiki.title.trim()}
                            </div>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            display: "inline-flex",
                            height: 28,
                            width: 28,
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "50%",
                            border: "1px solid rgba(148, 163, 184, 0.25)",
                            background: "rgba(30, 41, 59, 0.4)",
                            color: "#94a3b8",
                            cursor: "pointer",
                            fontSize: 12,
                            transition: "all 0.2s",
                            outline: "none",
                        }}
                        className="hover:bg-slate-700/50 hover:text-slate-100"
                        aria-label="Close wiki sidebar"
                    >
                        x
                    </button>
                </div>
            </div>

            {toc.length ? (
                <div
                    style={{
                        borderBottom: "1px solid rgba(148, 163, 184, 0.15)",
                        padding: "8px 12px",
                    }}
                >
                    <div
                        ref={tocContainerRef}
                        className="uhm-public-wiki-toc-list"
                        style={{
                            display: "flex",
                            gap: 8,
                            overflowX: "auto",
                            paddingBottom: 4,
                        }}
                    >
                        {toc.slice(0, 8).map((item) => {
                            const isActive = effectiveActiveHeadingId === item.id;
                            return (
                                <a
                                    key={item.id}
                                    href={`#${item.id}`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setActiveHeadingId(item.id);
                                        const root = contentRootRef.current;
                                        if (root) {
                                            const targetElement = root.querySelector(`#${CSS.escape(item.id)}`) as HTMLElement | null;
                                            const scrollContainer = root.parentElement;
                                            if (targetElement && scrollContainer) {
                                                const containerTop = scrollContainer.getBoundingClientRect().top;
                                                const targetTop = targetElement.getBoundingClientRect().top;
                                                const scrollOffset = targetTop - containerTop + scrollContainer.scrollTop;
                                                scrollContainer.scrollTo({
                                                    top: scrollOffset - 12,
                                                    behavior: "smooth"
                                                });
                                            }
                                        }
                                    }}
                                    style={{
                                        flexShrink: 0,
                                        borderRadius: 9999,
                                        padding: "4px 10px",
                                        fontSize: 11,
                                        fontWeight: 650,
                                        textDecoration: "none",
                                        transition: "all 0.2s",
                                        background: isActive
                                            ? "rgba(56, 189, 248, 0.15)"
                                            : "rgba(30, 41, 59, 0.4)",
                                        color: isActive ? "#38bdf8" : "#94a3b8",
                                        border: isActive
                                            ? "1px solid rgba(56, 189, 248, 0.3)"
                                            : "1px solid rgba(148, 163, 184, 0.1)",
                                    }}
                                    className={isActive ? "" : "hover:bg-slate-700/40 hover:text-slate-200"}
                                >
                                    {item.text}
                                </a>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            <div
                className="uhm-public-wiki-sidebar-content"
                style={{
                    minHeight: 0,
                    flex: 1,
                    overflowY: "auto",
                }}
            >
                {isLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
                        <div
                            style={{ height: 16, width: 110, borderRadius: 4, background: "rgba(148, 163, 184, 0.15)" }}
                            className="animate-pulse"
                        />
                        <div
                            style={{ height: 16, width: "100%", borderRadius: 4, background: "rgba(148, 163, 184, 0.15)" }}
                            className="animate-pulse"
                        />
                        <div
                            style={{ height: 16, width: "80%", borderRadius: 4, background: "rgba(148, 163, 184, 0.15)" }}
                            className="animate-pulse"
                        />
                    </div>
                ) : error ? (
                    <div style={{ padding: 16, fontSize: 14, color: "#f87171" }}>
                        {error}
                    </div>
                ) : wiki ? (
                    <div
                        ref={contentRootRef}
                        className="uhm-wiki-sidebar-view ql-editor"
                        style={{ fontSize: 14, color: "#cbd5e1" }}
                        dangerouslySetInnerHTML={{ __html: renderHtml }}
                    />
                ) : (
                    <div style={{ padding: 16, fontSize: 14, color: "#94a3b8" }}>
                        Entity này chưa có wiki liên kết.
                    </div>
                )}
            </div>

            <style jsx global>{`
                .uhm-public-wiki-sidebar-content::-webkit-scrollbar {
                    width: 6px;
                }
                .uhm-public-wiki-sidebar-content::-webkit-scrollbar-track {
                    background: transparent;
                }
                .uhm-public-wiki-sidebar-content::-webkit-scrollbar-thumb {
                    background: rgba(148, 163, 184, 0.22);
                    border-radius: 3px;
                }
                .uhm-public-wiki-sidebar-content::-webkit-scrollbar-thumb:hover {
                    background: rgba(148, 163, 184, 0.4);
                }
                .uhm-public-wiki-toc-list::-webkit-scrollbar {
                    height: 4px;
                }
                .uhm-public-wiki-toc-list::-webkit-scrollbar-track {
                    background: transparent;
                }
                .uhm-public-wiki-toc-list::-webkit-scrollbar-thumb {
                    background: rgba(148, 163, 184, 0.22);
                    border-radius: 2px;
                }
                .uhm-public-wiki-toc-list::-webkit-scrollbar-thumb:hover {
                    background: rgba(148, 163, 184, 0.4);
                }
                .uhm-wiki-sidebar-view.ql-editor {
                    height: auto;
                    overflow-y: visible;
                    padding: 18px 18px 22px;
                    line-height: 1.6;
                    font-size: 14.5px;
                    word-wrap: break-word;
                    word-break: break-word;
                    overflow-wrap: break-word;
                    color: #cbd5e1 !important;
                }
                .uhm-wiki-sidebar-view.ql-editor p {
                    margin: 0 0 0.75em;
                }
                .uhm-wiki-sidebar-view.ql-editor h1 {
                    margin: 1.15em 0 0.6em;
                    font-size: 1.6em;
                    font-weight: 800;
                    line-height: 1.2;
                    color: #f8fafc !important;
                }
                .uhm-wiki-sidebar-view.ql-editor h2 {
                    margin: 1.05em 0 0.55em;
                    font-size: 1.3em;
                    font-weight: 800;
                    line-height: 1.25;
                    color: #f8fafc !important;
                }
                .uhm-wiki-sidebar-view.ql-editor h3,
                .uhm-wiki-sidebar-view.ql-editor h4,
                .uhm-wiki-sidebar-view.ql-editor h5,
                .uhm-wiki-sidebar-view.ql-editor h6 {
                    margin: 0.95em 0 0.45em;
                    font-size: 1.05em;
                    font-weight: 700;
                    line-height: 1.3;
                    color: #f8fafc !important;
                }
                .uhm-wiki-sidebar-view.ql-editor ul,
                .uhm-wiki-sidebar-view.ql-editor ol {
                    margin: 0 0 0.75em;
                    padding-left: 1.5em;
                }
                .uhm-wiki-sidebar-view.ql-editor blockquote {
                    margin: 0 0 0.75em;
                    padding-left: 12px;
                    border-left: 3px solid rgba(148, 163, 184, 0.4);
                    color: rgba(203, 213, 225, 0.95);
                }
                .uhm-wiki-sidebar-view.ql-editor pre {
                    margin: 0 0 0.75em;
                    padding: 12px 14px;
                    border: 1px solid rgba(148, 163, 184, 0.22);
                    border-radius: 10px;
                    background: rgba(15, 23, 42, 0.4);
                    overflow-x: auto;
                    white-space: pre-wrap;
                    word-break: break-all;
                    color: #cbd5e1;
                }
                 .uhm-wiki-sidebar-view.ql-editor img {
                     max-width: 100%;
                     height: auto;
                     border-radius: 8px;
                     box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                 }
                 .uhm-wiki-sidebar-view.ql-editor img[style*="float: left"],
                 .uhm-wiki-sidebar-view.ql-editor img.ql-align-left {
                     float: left !important;
                     margin: 4px 14px 14px 0px !important;
                     display: inline !important;
                 }
                 .uhm-wiki-sidebar-view.ql-editor img[style*="float: right"],
                 .uhm-wiki-sidebar-view.ql-editor img.ql-align-right {
                     float: right !important;
                     margin: 4px 0px 14px 14px !important;
                     display: inline !important;
                 }
                 .uhm-wiki-sidebar-view.ql-editor img[style*="display: block"],
                 .uhm-wiki-sidebar-view.ql-editor img.ql-align-center {
                     display: block !important;
                     margin: 1.25em auto !important;
                 }
                .uhm-wiki-sidebar-view.ql-editor a {
                    text-decoration: underline;
                    text-underline-offset: 2px;
                }
                .uhm-wiki-sidebar-view.ql-editor a[href]:not([href=""]):not([href="__missing__"]) {
                    color: #38bdf8 !important;
                    transition: color 0.15s ease;
                }
                .uhm-wiki-sidebar-view.ql-editor a[href]:not([href=""]):not([href="__missing__"]):hover {
                    color: #7dd3fc !important;
                }
                .uhm-wiki-sidebar-view.ql-editor a[href="__missing__"] {
                    cursor: default;
                    pointer-events: none;
                }
                .uhm-wiki-sidebar-view.ql-editor a:not([href]),
                .uhm-wiki-sidebar-view.ql-editor a[href=""],
                .uhm-wiki-sidebar-view.ql-editor a[href="__missing__"] {
                    color: #f87171 !important;
                }
                @media (max-width: 640px) {
                    .uhm-wiki-sidebar-view.ql-editor {
                        padding: 14px 14px 20px;
                        font-size: 13.5px;
                    }
                    .uhm-wiki-sidebar-view.ql-editor h1 {
                        font-size: 1.4em;
                    }
                    .uhm-wiki-sidebar-view.ql-editor h2 {
                        font-size: 1.2em;
                    }
                }
            `}</style>
        </div>
    );
}
