"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "react-quill-new/dist/quill.snow.css";

import { ApiError } from "@/uhm/api/http";
import { fetchWikiBySlug, getContentByVersionWikiId, type Wiki } from "@/uhm/api/wikis";

type TocItem = {
  id: string;
  level: number;
  text: string;
};

type WikiVersionRow = {
  id: string;
  title?: string;
  created_at?: string;
  content?: string;
  isCurrent: boolean;
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
  const value = String(raw || "").trim();
  if (!value.length) return "";

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

function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions): string {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(
    "vi-VN",
    options || {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
}

export default function WikiBySlugClient({ slug }: { slug: string }) {
  const [wiki, setWiki] = useState<Wiki | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"read" | "history" | "compare">("read");
  const [selectedVersionsForCompare, setSelectedVersionsForCompare] = useState<Set<string>>(new Set());
  const [comparisonData, setComparisonData] = useState<{ id: string; content: string; createdAt: string; title: string }[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  const [renderHtml, setRenderHtml] = useState<string>("");
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<{
    slug: string;
    top: number;
    left: number;
    width: number;
    height: number;
    visible: boolean;
  } | null>(null);
  const [linkPreviewData, setLinkPreviewData] = useState<{
    slug: string;
    title: string;
    quote: string | null;
    status: "idle" | "loading" | "ready" | "error";
  } | null>(null);

  const normalizedSlug = useMemo(() => String(slug || "").trim(), [slug]);
  const contentRootRef = useRef<HTMLDivElement | null>(null);
  const hidePreviewTimerRef = useRef<number | null>(null);
  const previewCacheRef = useRef<Map<string, { title: string; quote: string | null }>>(new Map());

  const allVersions = useMemo<WikiVersionRow[]>(() => {
    if (!wiki) return [];
    const current: WikiVersionRow = {
      id: wiki.id,
      created_at: wiki.updated_at,
      content: wiki.content,
      isCurrent: true,
    };
    const history: WikiVersionRow[] = (wiki.content_sample || []).map((s) => ({ ...s, isCurrent: false }));
    const uniqueHistory = history.filter(h => h.id !== current.id);
    const combined = [current, ...uniqueHistory];
    return combined
      .filter(v => v.id && v.created_at)
      .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());
  }, [wiki]);
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
        let versionContent = res?.content;
        try {
          if (res?.content_sample?.[0]?.id) {
            const contentResp = await getContentByVersionWikiId(res.content_sample[0].id);
            if (contentResp?.data?.content) {
              versionContent = contentResp.data.content;
            }
          }
        } catch (err) {
          console.error("Failed to fetch version content:", err);
        }

        if (disposed) return;
        if (!res) {
          setWiki(null);
          setStatus("ready");
          setRenderHtml("");
          setToc([]);
          return;
        }
        setWiki({ ...res, content: versionContent });
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

  // Hover preview for internal wiki links (title + first blockquote).
  useEffect(() => {
    const root = contentRootRef.current;
    if (!root) return;
    if (typeof window === "undefined") return;

    const clearHideTimer = () => {
      if (hidePreviewTimerRef.current != null) {
        window.clearTimeout(hidePreviewTimerRef.current);
        hidePreviewTimerRef.current = null;
      }
    };

    const hideSoon = () => {
      clearHideTimer();
      hidePreviewTimerRef.current = window.setTimeout(() => {
        setLinkPreview((prev) => (prev ? { ...prev, visible: false } : prev));
      }, 140);
    };

    const resolveInternalWikiSlug = (href: string): string | null => {
      const h = href.trim();
      if (!h.length) return null;
      if (h === "__missing__") return null;
      if (h.startsWith("#")) return null;

      const stripQueryHash = (s: string) => {
        const m = s.match(/^([^?#]+)([?#].*)?$/);
        return String(m?.[1] || "");
      };

      if (h.startsWith("/wiki/")) {
        const path = stripQueryHash(h);
        const slugPart = path.slice("/wiki/".length).trim();
        return slugPart ? decodeURIComponent(slugPart) : null;
      }

      const originPrefix = window.location.origin + "/wiki/";
      if (h.startsWith(originPrefix)) {
        const rest = stripQueryHash(h.slice(originPrefix.length));
        const slugPart = rest.trim();
        return slugPart ? decodeURIComponent(slugPart) : null;
      }

      return null;
    };

    const fetchPreview = async (targetSlug: string) => {
      const key = targetSlug.trim();
      if (!key.length) return;

      const cached = previewCacheRef.current.get(key);
      if (cached) {
        setLinkPreviewData({ slug: key, title: cached.title, quote: cached.quote, status: "ready" });
        return;
      }

      setLinkPreviewData((prev) => ({ slug: key, title: prev?.title || key, quote: null, status: "loading" }));
      try {
        const row = await fetchWikiBySlug(key);
        if (!row) {
          setLinkPreviewData({ slug: key, title: key, quote: null, status: "error" });
          return;
        }

        const html = normalizeWikiContentToHtml(row.content ?? "");
        let quote: string | null = null;
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const bq = doc.body.querySelector("blockquote");
          const txt = String(bq?.textContent || "").trim();
          quote = txt.length ? txt : null;
        } catch {
          quote = null;
        }

        const title = String(row.title || "").trim() || key;
        previewCacheRef.current.set(key, { title, quote });
        setLinkPreviewData({ slug: key, title, quote, status: "ready" });
      } catch {
        setLinkPreviewData({ slug: key, title: key, quote: null, status: "error" });
      }
    };

    const showForAnchor = (a: HTMLAnchorElement) => {
      const href = String(a.getAttribute("href") || "").trim();
      const targetSlug = resolveInternalWikiSlug(href);
      if (!targetSlug) return;

      // Avoid previews on touch devices.
      if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;

      const rect = a.getBoundingClientRect();
      const width = 420;
      const height = 320;
      const margin = 12;

      const preferredLeft = rect.right + margin;
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      const left = Math.min(preferredLeft, maxLeft);

      const preferredTop = rect.top;
      const maxTop = Math.max(margin, window.innerHeight - height - margin);
      const top = Math.max(margin, Math.min(preferredTop, maxTop));

      clearHideTimer();
      setLinkPreview({ slug: targetSlug, top, left, width, height, visible: true });
      void fetchPreview(targetSlug);
    };

    const onMouseOver = (evt: MouseEvent) => {
      const target = evt.target as HTMLElement | null;
      const a = target?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      showForAnchor(a);
    };

    const onMouseOut = (evt: MouseEvent) => {
      const target = evt.target as HTMLElement | null;
      const related = evt.relatedTarget as HTMLElement | null;
      const fromA = target?.closest?.("a");
      if (!fromA) return;
      if (related && related.closest?.(".uhm-wiki-link-preview")) return;
      hideSoon();
    };

    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        clearHideTimer();
        setLinkPreview((prev) => (prev ? { ...prev, visible: false } : prev));
      }
    };

    const onScroll = () => {
      setLinkPreview((prev) => (prev ? { ...prev, visible: false } : prev));
    };

    root.addEventListener("mouseover", onMouseOver);
    root.addEventListener("mouseout", onMouseOut);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      root.removeEventListener("mouseover", onMouseOver);
      root.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
      clearHideTimer();
    };
  }, [renderHtml]);

  const handleToggleVersionForCompare = (versionId: string) => {
    setSelectedVersionsForCompare(prev => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        if (next.size >= 3) {
          return prev; // Do not allow selecting more than 3
        }
        next.add(versionId);
      }
      return next;
    });
  };

  const handleCompareVersions = async () => {
    if (selectedVersionsForCompare.size < 1) {
      alert("Vui lòng chọn ít nhất 1 phiên bản để so sánh.");
      return;
    }
    setIsComparing(true);
    setError(null);
    try {
      const versionsToFetch = Array.from(selectedVersionsForCompare);
      const promises = versionsToFetch.map(async (versionId) => {
        const sample = allVersions.find(s => s.id === versionId);
        const versionInfo = {
          id: versionId,
          createdAt: sample?.created_at || 'Unknown date',
          title: `Phiên bản lúc ${formatDate(sample?.created_at)}`
        };
        if (sample?.isCurrent) {
          return { ...versionInfo, content: sample.content || "" };
        }


        const contentResp = await getContentByVersionWikiId(versionId);
        return { ...versionInfo, content: contentResp?.data?.content || "" };
      });
      const results = await Promise.all(promises);
      const processedResults = results.map(r => {
        const { html } = rewriteHtmlAndBuildToc(normalizeWikiContentToHtml(r.content), `${window.location.origin}/wiki/`);
        return { ...r, content: html };
      });
      setComparisonData(processedResults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setViewMode("compare");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Lỗi khi tải phiên bản để so sánh.";
      setError(msg);
      setViewMode("read");
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#202122] font-sans">
      <header className="bg-white border-b border-gray-300 px-6 py-2 flex justify-between items-center">
        <div className="text-lg font-bold">GeoHistory Wiki</div>
        <Link href="/" className="text-sm text-blue-600 hover:underline">Trang chủ</Link>
      </header>

      <div className={viewMode === 'compare' ? '' : 'mx-auto max-w-7xl px-4 sm:px-6 py-6'}>
        {status === "loading" && <div className="text-center p-10">Đang tải...</div>}
        {status === "error" && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">{error}</div>}
        {status === "ready" && !wiki && <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative">Không tìm thấy wiki với slug: <strong>{normalizedSlug}</strong></div>}

        {status === "ready" && wiki && (
          <>
            <div className={viewMode === 'compare' ? 'mx-auto max-w-7xl px-4 sm:px-6 py-6' : ''}>
              <h1 className="text-3xl pb-2 mb-1">
                {wiki.title?.trim() || normalizedSlug}
              </h1>
              {viewMode === 'compare' && (
                <div className="mt-4 p-3 border border-gray-300 bg-white rounded-sm text-xs space-y-1">
                  <div><span className="font-semibold">Slug:</span> {normalizedSlug || "-"}</div>
                  <div><span className="font-semibold">ID:</span> {wiki.id || "-"}</div>
                  <div><span className="font-semibold">Dự án:</span> {wiki.project_id || "-"}</div>
                  <div><span className="font-semibold">Tạo lúc:</span> {formatDate(wiki.created_at)}</div>
                  <div><span className="font-semibold">Cập nhật:</span> {formatDate(wiki.updated_at)}</div>
                </div>
              )}
            </div>

            <div className={`grid grid-cols-1 ${viewMode === 'compare' ? '' : 'lg:grid-cols-[minmax(0,1fr)_auto] gap-8 items-start'}`}>
              <main className={`min-w-0 bg-white ${viewMode === 'compare' ? 'border-y border-gray-300' : 'border border-gray-300 rounded-sm'}`}>
                <div className={`flex border-b border-gray-300 text-sm ${viewMode === 'compare' ? 'mx-auto max-w-7xl px-4 sm:px-6' : ''}`}>
                  <button onClick={() => setViewMode('read')} className={`px-4 py-2 ${viewMode === 'read' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-600'}`}>Bài viết</button>
                  <button onClick={() => setViewMode('history')} className={`px-4 py-2 ${viewMode === 'history' || viewMode === 'compare' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-600'}`}>Xem lịch sử</button>
                </div>

                {viewMode === 'read' && (
                  <div ref={contentRootRef} className="uhm-wiki-view ql-editor wiki-article" dangerouslySetInnerHTML={{ __html: renderHtml }} />
                )}

                {viewMode === 'history' && (
                  <div className="p-4">
                    <h2 className="text-xl mb-4 font-normal">Lịch sử phiên bản của &quot;{wiki.title}&quot;</h2>
                    <div className="flex gap-4 items-center mb-4">
                      <button onClick={handleCompareVersions} disabled={isComparing || selectedVersionsForCompare.size === 0} className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300">
                        {isComparing ? 'Đang tải...' : `So sánh ${selectedVersionsForCompare.size} phiên bản đã chọn`}
                      </button>
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-2 w-16 text-center">So sánh</th>
                            <th className="p-2">Ngày cập nhật</th>
                            <th className="p-2">Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allVersions.map((v) => {
                            const isChecked = selectedVersionsForCompare.has(v.id!);
                            const isDisabled = !isChecked && selectedVersionsForCompare.size >= 3;
                            return (
                              <tr key={v.id} className={`border-t ${isDisabled ? "opacity-50" : ""}`}>
                                <td className="p-2 text-center">
                                  <input
                                    type="checkbox"
                                    onChange={() => handleToggleVersionForCompare(v.id!)}
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    className="h-4 w-4 disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="p-2 text-blue-600">{formatDate(v.created_at)}</td>
                                <td className="p-2">{v.isCurrent && <span className="font-bold">(Phiên bản hiện tại)</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {viewMode === 'compare' && (
                  <div className="p-4">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                      <h2 className="text-xl mb-4 font-normal">So sánh các phiên bản</h2>
                    </div>
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${comparisonData.length >= 3 ? 'xl:grid-cols-3' : ''} mx-auto px-4 sm:px-6`}>
                      {comparisonData.map(version => (
                        <div key={version.id} className="border rounded-lg overflow-hidden bg-white">
                          <h3 className="p-2 border-b font-semibold bg-gray-50 text-sm">{version.title}</h3>
                          <div className="uhm-wiki-view ql-editor wiki-article h-[70vh] overflow-auto" dangerouslySetInnerHTML={{ __html: version.content }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </main>

              {viewMode !== 'compare' && (
                <aside className="hidden lg:block self-start sticky top-6">
                  {viewMode === 'read' && toc.length > 0 && (
                    <div className="border border-gray-300 bg-[#f8f9fa] p-3 rounded-sm text-sm mb-6">
                      <p className="font-bold text-center mb-2">Mục lục</p>
                      <nav>
                        <div className="grid gap-1 w-full overflow-auto">
                          {toc.map((t) => {
                            const pad = Math.max(0, Math.min(5, t.level - 1)) * 12;
                            const isActive = activeHeadingId === t.id;
                            return (
                              <a key={t.id} href={`#${t.id}`} className={`block py-0.5 text-xs leading-5 transition break-words ${isActive ? "font-bold" : "text-blue-600 hover:underline"}`} style={{ paddingLeft: pad }} title={t.text}>
                                <span className="mr-1">{t.level}.</span>{t.text}
                              </a>
                            );
                          })}
                        </div>
                      </nav>
                    </div>
                  )}

                  <div className="border border-gray-300 bg-white rounded-sm text-xs overflow-hidden">
                    <table className="w-full">
                      <tbody>
                        <tr className="border-b border-gray-100 last:border-0">
                          <td className="px-2 py-2 font-normal text-gray-500 w-1/5">Slug</td>
                          <td className="px-2 py-2 text-gray-900 break-all">{normalizedSlug || "-"}</td>
                        </tr>
                        <tr className="border-b border-gray-100 last:border-0">
                          <td className="px-2 py-2 font-normal text-gray-500">ID</td>
                          <td className="px-2 py-2 text-gray-900">{wiki.id || "-"}</td>
                        </tr>
                        <tr className="border-b border-gray-100 last:border-0">
                          <td className="px-2 py-2 font-normal text-gray-500">Dự án</td>
                          <td className="px-2 py-2 text-gray-900">{wiki.project_id || "-"}</td>
                        </tr>
                        <tr className="border-b border-gray-100 last:border-0">
                          <td className="px-2 py-2 font-normal text-gray-500">Tạo lúc</td>
                          <td className="px-2 py-2 text-gray-900">{formatDate(wiki.created_at)}</td>
                        </tr>
                        <tr>
                          <td className="pr-1 pl-2 py-2 font-normal text-gray-500">Cập nhật</td>
                          <td className="px-2 py-2 text-gray-900">{formatDate(wiki.updated_at)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </div>

      {linkPreview && linkPreview.visible ? (
        <div
          className="uhm-wiki-link-preview fixed z-[9999]"
          style={{
            top: linkPreview.top,
            left: linkPreview.left,
            width: linkPreview.width,
            height: linkPreview.height,
          }}
          onMouseEnter={() => {
            if (hidePreviewTimerRef.current != null) {
              window.clearTimeout(hidePreviewTimerRef.current);
              hidePreviewTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            setLinkPreview((prev) => (prev ? { ...prev, visible: false } : prev));
          }}
        >
          <div className="h-full w-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg">
            <div className="h-full w-full p-3 grid grid-rows-[auto_1fr] gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-gray-500 dark:text-gray-400 break-all">
                  /wiki/{linkPreview.slug}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {linkPreviewData?.slug === linkPreview.slug
                    ? linkPreviewData.status === "loading"
                      ? "Loading..."
                      : linkPreviewData.status === "error"
                        ? "Not found"
                        : linkPreviewData.title
                    : "Loading..."}
                </div>
              </div>

              <div className="min-h-0 overflow-auto">
                {linkPreviewData?.slug === linkPreview.slug && linkPreviewData.status === "ready" ? (
                  linkPreviewData.quote ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words">
                      {linkPreviewData.quote}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 dark:text-gray-400">No resume.</div>
                  )
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400">Loading preview...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .wiki-article {
          
          line-height: 1.6;
          font-size: 1em;
          padding: 18px 20px;
        }
        .uhm-wiki-view.ql-editor {
          height: auto;
          overflow-y: visible;
        }
        .wiki-article p {
          margin: 0 0 0.75em;
        }
        .wiki-article h1,
        .wiki-article h2,
        .wiki-article h3,
        .wiki-article h4,
        .wiki-article h5,
        .wiki-article h6 {
          
          font-weight: normal;
          margin: 0.8em 0 0.3em;
          padding-bottom: 0.1em;
          border-bottom: 1px solid #a2a9b1;
          scroll-margin-top: 16px;
        }
        .wiki-article h1 {
          font-size: 1.8em;
          line-height: 1.2;
        }
        .wiki-article h2 {
          font-size: 1.5em;
          line-height: 1.25;
          margin-top: 1.4em;
        }
        .wiki-article h3 {
          font-size: 1.25em;
          line-height: 1.3;
        }
        .wiki-article h4,
        .wiki-article h5,
        .wiki-article h6 {
          font-size: 1.05em;
          line-height: 1.35;
        }
        .wiki-article ul,
        .wiki-article ol {
          margin: 0 0 0.75em;
          padding-left: 1.5em;
        }
        .wiki-article blockquote {
          margin: 0 0 0.75em;
          padding-left: 12px;
          border-left: 3px solid #a2a9b1;
          color: #202122;
        }
        .wiki-article pre {
          margin: 0 0 0.75em;
          padding: 12px 14px;
          border: 1px solid #a2a9b1;
          border-radius: 10px;
          background: #f8f9fa;
          overflow: auto;
          font-family: monospace;
        }
        .wiki-article img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }
        .wiki-article a {
          text-decoration: none;
        }
        .wiki-article a[href]:not([href=""]):not([href="__missing__"]) {
          color: #3366cc;
        }
        .wiki-article a[href]:not([href=""]):not([href="__missing__"]):hover {
          text-decoration: underline;
        }
        .wiki-article a[href="__missing__"] {
          cursor: default;
          pointer-events: none;
        }
        .wiki-article a:not([href]),
        .wiki-article a[href=""],
        .wiki-article a[href="__missing__"] {
          color: #dc2626;
        }
      `}</style>
    </div>
  );
}
