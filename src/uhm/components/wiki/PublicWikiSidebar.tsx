"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
// Loaded dynamically inside the component to prevent render-blocking

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
    onWikiLinkEntitySelectionRequest?: (request: { slug: string; rect: DOMRect }) => void;
    sidebarWidth?: number;
    onSidebarWidthChange?: (width: number) => void;
    maxDragWidth?: number;
    compactHeader?: boolean;
    sidebarHeight?: number;
    onSidebarHeightChange?: (height: number) => void;
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
        .replace(/đ/g, "d")
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

function extractWikiSlugFromHref(href: string): string {
    const raw = String(href || "").trim();
    if (!raw.length || raw === "__missing__") return "";
    if (raw.startsWith("#wiki:")) return raw.slice("#wiki:".length).trim();
    if (raw.startsWith("#")) return "";

    const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(raw);
    const baseOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    if (isAbsoluteUrl) {
        try {
            const url = new URL(raw, baseOrigin);
            if (typeof window !== "undefined" && url.origin !== window.location.origin) return "";
            const path = url.pathname.replace(/\/+$/, "");
            if (!path.startsWith("/wiki/")) return "";
            return decodeWikiSlug(path.slice("/wiki/".length));
        } catch {
            return "";
        }
    }

    const match = raw.match(/^([^?#]+)([?#].*)?$/);
    let slug = String(match?.[1] || "").replace(/^\/+/, "").replace(/\/+$/, "").trim();
    if (slug.startsWith("wiki/")) {
        slug = slug.slice("wiki/".length).trim();
    }
    return decodeWikiSlug(slug);
}

function decodeWikiSlug(slug: string): string {
    try {
        return decodeURIComponent(slug).trim();
    } catch {
        return slug.trim();
    }
}

function prepareWikiHtml(inputHtml: string): { html: string; toc: TocItem[] } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(inputHtml, "text/html");

    for (const el of Array.from(doc.querySelectorAll("script"))) el.remove();

    for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
        const href = String(a.getAttribute("href") || "").trim();
        if (!href.length) continue;
        if (href === "__missing__") continue;
        const slugPart = extractWikiSlugFromHref(href);
        if (slugPart.length) {
            a.setAttribute("href", `#wiki:${slugPart}`);
            a.setAttribute("data-wiki-slug", slugPart);
            a.setAttribute("target", "_self");
            continue;
        }

        if (isExternalHref(href)) {
            a.setAttribute("target", "_blank");
            a.setAttribute("rel", "noopener noreferrer");
        }
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

function PublicWikiSidebar({
    entity,
    wiki,
    isLoading,
    error,
    onClose,
    onWikiLinkRequest,
    onWikiLinkEntitySelectionRequest,
    sidebarWidth,
    onSidebarWidthChange,
    maxDragWidth,
    compactHeader = false,
    sidebarHeight,
    onSidebarHeightChange,
}: Props) {
    const contentRootRef = useRef<HTMLDivElement | null>(null);
    const tocContainerRef = useRef<HTMLDivElement | null>(null);
    const [wikiLinkMenu, setWikiLinkMenu] = useState<{
        slug: string;
        rect: DOMRect;
        top: number;
        left: number;
    } | null>(null);

    useEffect(() => {
        import("react-quill-new/dist/quill.snow.css");
    }, []);

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

        // Tạo đường ghost ảo chỉ vị trí kéo thay vì kích hoạt re-render liên tục
        const ghost = document.createElement("div");
        ghost.style.position = "fixed";
        ghost.style.top = "0";
        ghost.style.bottom = "0";
        ghost.style.width = "4px";
        ghost.style.backgroundColor = "#38bdf8";
        ghost.style.boxShadow = "0 0 12px rgba(56, 189, 248, 0.8)";
        ghost.style.zIndex = "99999";
        ghost.style.cursor = "col-resize";
        ghost.style.pointerEvents = "none";
        ghost.style.left = `${startX}px`;
        document.body.appendChild(ghost);

        const onMove = (e: PointerEvent) => {
            ghost.style.left = `${e.clientX}px`;
        };

        const onUp = (e: PointerEvent) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            if (ghost.parentNode) {
                ghost.parentNode.removeChild(ghost);
            }
            const deltaX = e.clientX - startX;
            const nextWidth = Math.max(320, Math.min(maxDragWidthLimit, startWidth - deltaX));
            setWidth(nextWidth);
            if (typeof window !== "undefined") {
                localStorage.setItem("public-wiki-sidebar-width", String(nextWidth));
            }
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

    useLayoutEffect(() => {
        const firstHeadingId = toc[0]?.id ?? null;
        setActiveHeadingId(firstHeadingId);

        const scrollContainer = contentRootRef.current?.parentElement;
        scrollContainer?.scrollTo({ top: 0, behavior: "auto" });
        tocContainerRef.current?.scrollTo({ left: 0, behavior: "auto" });
    }, [wiki?.id, wiki?.slug, renderHtml, toc]);

    useEffect(() => {
        if (!toc.length) return;
        const root = contentRootRef.current;
        if (!root) return;

        const headings = toc
            .map((item) => root.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`))
            .filter((item): item is HTMLElement => Boolean(item));
        if (!headings.length) return;

        const scrollContainer = root.parentElement;
        const updateActiveHeading = () => {
            const containerRect = scrollContainer?.getBoundingClientRect();
            const topBoundary = (containerRect?.top ?? 0) + (containerRect?.height ?? window.innerHeight) * 0.18;
            const bottomBoundary = (containerRect?.top ?? 0) + (containerRect?.height ?? window.innerHeight) * 0.82;
            const visibleHeadings = headings
                .map((heading) => ({ heading, rect: heading.getBoundingClientRect() }))
                .filter(({ rect }) => rect.bottom >= topBoundary && rect.top <= bottomBoundary)
                .sort((a, b) => {
                    const aDistance = Math.abs(a.rect.top - topBoundary);
                    const bDistance = Math.abs(b.rect.top - topBoundary);
                    return aDistance - bDistance;
                });
            const nextHeading = visibleHeadings[0]?.heading || headings[0];
            if (nextHeading?.id) setActiveHeadingId(nextHeading.id);
        };

        const observer = new IntersectionObserver(
            updateActiveHeading,
            { root: scrollContainer || null, rootMargin: "-18% 0px -70% 0px", threshold: [0, 1] }
        );

        for (const heading of headings) observer.observe(heading);
        scrollContainer?.addEventListener("scroll", updateActiveHeading, { passive: true });
        return () => {
            observer.disconnect();
            scrollContainer?.removeEventListener("scroll", updateActiveHeading);
        };
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
            const fallbackLink = target?.closest?.("a[href]") as HTMLAnchorElement | null;
            const sourceLink = link || fallbackLink;
            if (!sourceLink) return;

            const slug = String(
                sourceLink.getAttribute("data-wiki-slug") ||
                extractWikiSlugFromHref(sourceLink.getAttribute("href") || "")
            ).trim();
            if (!slug.length) return;

            event.preventDefault();
            onWikiLinkRequest({ slug, rect: sourceLink.getBoundingClientRect() });
        };

        root.addEventListener("click", handleClick);
        return () => root.removeEventListener("click", handleClick);
    }, [onWikiLinkRequest, renderHtml]);

    useEffect(() => {
        const root = contentRootRef.current;
        if (!root) return;

        const handleContextMenu = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            const link = target?.closest?.("a[data-wiki-slug]") as HTMLAnchorElement | null;
            const fallbackLink = target?.closest?.("a[href]") as HTMLAnchorElement | null;
            const sourceLink = link || fallbackLink;
            if (!sourceLink) return;

            const slug = String(
                sourceLink.getAttribute("data-wiki-slug") ||
                extractWikiSlugFromHref(sourceLink.getAttribute("href") || "")
            ).trim();
            if (!slug.length) return;

            event.preventDefault();
            setWikiLinkMenu({
                slug,
                rect: sourceLink.getBoundingClientRect(),
                ...computeContextMenuPosition(event.clientX, event.clientY, 220, 88),
            });
        };

        root.addEventListener("contextmenu", handleContextMenu, true);
        return () => root.removeEventListener("contextmenu", handleContextMenu, true);
    }, [renderHtml]);

    useEffect(() => {
        if (!wikiLinkMenu) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest?.("[data-wiki-link-context-menu='true']")) return;
            setWikiLinkMenu(null);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setWikiLinkMenu(null);
        };
        const closeMenu = () => setWikiLinkMenu(null);

        window.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("resize", closeMenu);
        window.addEventListener("scroll", closeMenu, true);
        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("resize", closeMenu);
            window.removeEventListener("scroll", closeMenu, true);
        };
    }, [wikiLinkMenu]);

    const handleOpenStandaloneWiki = (slug: string) => {
        if (typeof window === "undefined") return;
        const url = `/wiki/${encodeURIComponent(slug)}`;
        const nextWindow = window.open(url, "_blank", "noopener,noreferrer");
        if (nextWindow) nextWindow.opener = null;
    };

    const isExpanded = useMemo(() => {
        if (typeof window === "undefined") return false;
        const fullHeight = Math.round(window.innerHeight * 0.70);
        return (sidebarHeight || 400) >= fullHeight;
    }, [sidebarHeight]);

    const handleHeightToggle = () => {
        if (typeof window === "undefined") return;
        const halfHeight = Math.round(window.innerHeight * 0.45);
        const fullHeight = Math.round(window.innerHeight * 0.85);
        const currentHeight = sidebarHeight || 400;

        const nextHeight = Math.abs(currentHeight - halfHeight) < Math.abs(currentHeight - fullHeight)
            ? fullHeight
            : halfHeight;

        if (onSidebarHeightChange) {
            onSidebarHeightChange(nextHeight);
        }
    };

    const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
    useEffect(() => {
        const checkDevice = () => setIsMobileOrTablet(window.innerWidth < 1024);
        checkDevice();
        window.addEventListener("resize", checkDevice);
        return () => window.removeEventListener("resize", checkDevice);
    }, []);

    return (
        <div
            style={{
                width: isMobileOrTablet ? "100%" : `${width}px`,
                maxWidth: "100%",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                minHeight: 0,
                overflow: "hidden",
                borderRadius: isMobileOrTablet ? "24px 24px 0 0" : 20,
                border: isMobileOrTablet ? "1px solid rgba(148, 163, 184, 0.22)" : "1px solid rgba(148, 163, 184, 0.22)",
                borderBottom: isMobileOrTablet ? "none" : "1px solid rgba(148, 163, 184, 0.22)",
                borderLeft: isMobileOrTablet ? "none" : "1px solid rgba(148, 163, 184, 0.22)",
                borderRight: isMobileOrTablet ? "none" : "1px solid rgba(148, 163, 184, 0.22)",
                background: "linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))",
                boxShadow: "0 20px 48px rgba(2, 6, 23, 0.45)",
                backdropFilter: "blur(12px)",
                position: "relative",
            }}
        >
            {/* Grab Handle for bottom sheet on mobile */}
            {isMobileOrTablet ? (
                <div
                    onClick={handleHeightToggle}
                    style={{
                        width: "100%",
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        zIndex: 60,
                        userSelect: "none",
                        flexShrink: 0,
                        gap: 8,
                    }}
                >
                    <div
                        style={{
                            width: 36,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: "rgba(255, 255, 255, 0.3)",
                        }}
                    />
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.5)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.3s ease",
                        }}
                    >
                        <polyline points="18 15 12 9 6 15" />
                    </svg>
                </div>
            ) : null}

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
                className="group hidden lg:block"
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
                        {compactHeader ? null : (
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
                        )}
                        <div
                            style={{
                                marginTop: compactHeader ? 0 : 4,
                                fontSize: 18,
                                fontWeight: 700,
                                lineHeight: 1.3,
                                color: "#f8fafc",
                            }}
                        >
                            {wiki?.title?.trim() || entity?.name?.trim() || "Wiki"}
                        </div>
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
                {isLoading && !wiki ? (
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
                    <div style={{ position: "relative", minHeight: "100%" }}>
                        {isLoading ? (
                            <div
                                aria-hidden="true"
                                style={{
                                    position: "sticky",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: 2,
                                    zIndex: 2,
                                    overflow: "hidden",
                                    background: "rgba(56, 189, 248, 0.08)",
                                }}
                            >
                                <div
                                    className="uhm-wiki-sidebar-loading-bar"
                                    style={{
                                        height: "100%",
                                        width: "42%",
                                        background: "linear-gradient(90deg, transparent, #38bdf8, transparent)",
                                    }}
                                />
                            </div>
                        ) : null}
                        <div
                            ref={contentRootRef}
                            className="uhm-wiki-sidebar-view ql-editor"
                            style={{ fontSize: 14, color: "#cbd5e1" }}
                            dangerouslySetInnerHTML={{ __html: renderHtml }}
                        />
                    </div>
                ) : (
                    <div style={{ padding: 16, fontSize: 14, color: "#94a3b8" }}>
                        Entity này chưa có wiki liên kết.
                    </div>
                )}
            </div>

            {wikiLinkMenu && typeof document !== "undefined"
                ? createPortal(
                    <div
                        data-wiki-link-context-menu="true"
                        style={{
                            position: "fixed",
                            top: wikiLinkMenu.top,
                            left: wikiLinkMenu.left,
                            zIndex: 100000,
                            width: 220,
                            overflow: "hidden",
                            borderRadius: 10,
                            border: "1px solid rgba(148, 163, 184, 0.28)",
                            background: "rgba(15, 23, 42, 0.98)",
                            boxShadow: "0 18px 42px rgba(2, 6, 23, 0.48)",
                            color: "#e2e8f0",
                            padding: 6,
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                handleOpenStandaloneWiki(wikiLinkMenu.slug);
                                setWikiLinkMenu(null);
                            }}
                            style={wikiLinkMenuButtonStyle}
                            className="hover:bg-sky-500/15 hover:text-sky-100"
                        >
                            Mở wiki riêng
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const request = { slug: wikiLinkMenu.slug, rect: wikiLinkMenu.rect };
                                if (onWikiLinkEntitySelectionRequest) {
                                    onWikiLinkEntitySelectionRequest(request);
                                } else {
                                    onWikiLinkRequest(request);
                                }
                                setWikiLinkMenu(null);
                            }}
                            style={wikiLinkMenuButtonStyle}
                            className="hover:bg-sky-500/15 hover:text-sky-100"
                        >
                            Mở bảng chọn entity
                        </button>
                    </div>,
                    document.body
                )
                : null}

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
                @keyframes uhm-wiki-sidebar-loading-bar {
                    from {
                        transform: translateX(-120%);
                    }
                    to {
                        transform: translateX(260%);
                    }
                }
                .uhm-wiki-sidebar-loading-bar {
                    animation: uhm-wiki-sidebar-loading-bar 1.1s ease-in-out infinite;
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

const wikiLinkMenuButtonStyle = {
    display: "block",
    width: "100%",
    border: 0,
    borderRadius: 7,
    background: "transparent",
    padding: "9px 10px",
    color: "inherit",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: "18px",
    textAlign: "left" as const,
};

function computeContextMenuPosition(clientX: number, clientY: number, width: number, height: number) {
    const margin = 8;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
    return {
        left: Math.max(margin, Math.min(clientX, viewportWidth - width - margin)),
        top: Math.max(margin, Math.min(clientY, viewportHeight - height - margin)),
    };
}

export default memo(PublicWikiSidebar);
