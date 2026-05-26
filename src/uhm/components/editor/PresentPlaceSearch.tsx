"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { searchGeometriesByEntityName, type EntityGeometriesSearchItem, type EntityGeometrySearchGeo } from "@/uhm/api/geometries";
import {
    fetchPresentPlaceDetail,
    hasSearchMapApiKey,
    reverseGeocodePresentPlace,
    searchPresentPlaces,
    type PresentPlacePrediction,
    type PresentPlaceSelection,
} from "@/uhm/api/goongPlaces";
import { getGeometryRepresentativePoint } from "@/uhm/components/map/mapUtils";

export type { PresentPlaceSelection } from "@/uhm/api/goongPlaces";

export type HistoricalGeometryFocusPayload = {
    entity: EntityGeometriesSearchItem;
    geometry: EntityGeometrySearchGeo;
    representativePoint: [number, number] | null;
    adminLabel: string | null;
};

type SearchMode = "present" | "history";

type AdminLabelState = {
    status: "loading" | "loaded" | "error";
    label: string | null;
    address: string | null;
};

type Props = {
    focusedPlace: PresentPlaceSelection | null;
    onFocusPlace: (place: PresentPlaceSelection) => void;
    onFocusHistoricalGeometry: (payload: HistoricalGeometryFocusPayload) => void;
    onClearFocus: () => void;
    rightOffset?: number;
};

export default function PresentPlaceSearch({
    focusedPlace,
    onFocusPlace,
    onFocusHistoricalGeometry,
    onClearFocus,
    rightOffset = 18,
}: Props) {
    const [mode, setMode] = useState<SearchMode>("present");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PresentPlacePrediction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectingPlaceId, setSelectingPlaceId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [historicalQuery, setHistoricalQuery] = useState("");
    const [historicalResults, setHistoricalResults] = useState<EntityGeometriesSearchItem[]>([]);
    const [isHistoricalLoading, setIsHistoricalLoading] = useState(false);
    const [historicalError, setHistoricalError] = useState<string | null>(null);
    const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);
    const [selectingGeometryId, setSelectingGeometryId] = useState<string | null>(null);
    const [adminLabels, setAdminLabels] = useState<Record<string, AdminLabelState>>({});

    const [isOpen, setIsOpen] = useState(false);
    const requestSeqRef = useRef(0);
    const historicalRequestSeqRef = useRef(0);
    const hasApiKey = hasSearchMapApiKey();

    const activeQuery = mode === "present" ? query : historicalQuery;
    const activeError = mode === "present" ? error : historicalError;
    const activeLoading = mode === "present" ? isLoading : isHistoricalLoading;

    const expandedItem = useMemo(() => {
        if (!expandedEntityId) return null;
        return historicalResults.find((item) => item.entity_id === expandedEntityId) || null;
    }, [expandedEntityId, historicalResults]);

    useEffect(() => {
        if (mode !== "present") return;

        const keyword = query.trim();
        if (!keyword || keyword.length < 2) {
            setResults([]);
            setIsLoading(false);
            setError(null);
            return;
        }

        if (!hasApiKey) {
            setResults([]);
            setIsLoading(false);
            setError("Thiếu SEARCH_MAP_API_KEY.");
            return;
        }

        const controller = new AbortController();
        const seq = requestSeqRef.current + 1;
        requestSeqRef.current = seq;
        const timer = window.setTimeout(() => {
            setIsLoading(true);
            setError(null);
            searchPresentPlaces(keyword, controller.signal)
                .then((nextResults) => {
                    if (requestSeqRef.current !== seq) return;
                    setResults(nextResults);
                    setIsOpen(true);
                })
                .catch((err) => {
                    if (controller.signal.aborted || requestSeqRef.current !== seq) return;
                    setResults([]);
                    setError(err instanceof Error ? err.message : "Không search được địa điểm.");
                })
                .finally(() => {
                    if (requestSeqRef.current === seq) {
                        setIsLoading(false);
                    }
                });
        }, 260);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [hasApiKey, mode, query]);

    useEffect(() => {
        if (mode !== "history") return;

        const keyword = historicalQuery.trim();
        if (!keyword || keyword.length < 2) {
            setHistoricalResults([]);
            setIsHistoricalLoading(false);
            setHistoricalError(null);
            setExpandedEntityId(null);
            return;
        }

        const seq = historicalRequestSeqRef.current + 1;
        historicalRequestSeqRef.current = seq;
        const timer = window.setTimeout(() => {
            setIsHistoricalLoading(true);
            setHistoricalError(null);
            searchGeometriesByEntityName(keyword, { limit: 12 })
                .then((response) => {
                    if (historicalRequestSeqRef.current !== seq) return;
                    setHistoricalResults(response.items || []);
                    setExpandedEntityId(null);
                    setIsOpen(true);
                })
                .catch((err) => {
                    if (historicalRequestSeqRef.current !== seq) return;
                    setHistoricalResults([]);
                    setHistoricalError(err instanceof Error ? err.message : "Không search được entity lịch sử.");
                })
                .finally(() => {
                    if (historicalRequestSeqRef.current === seq) {
                        setIsHistoricalLoading(false);
                    }
                });
        }, 260);

        return () => window.clearTimeout(timer);
    }, [historicalQuery, mode]);

    useEffect(() => {
        if (mode !== "history" || !expandedItem || expandedItem.geometries.length <= 1 || !hasApiKey) {
            return;
        }

        const controller = new AbortController();
        for (const geometry of expandedItem.geometries) {
            const point = getGeometryRepresentativePoint(geometry.draw_geometry);
            if (!point) {
                setAdminLabels((prev) => ({
                    ...prev,
                    [geometry.id]: { status: "error", label: null, address: null },
                }));
                continue;
            }

            setAdminLabels((prev) => {
                if (prev[geometry.id]) return prev;
                return {
                    ...prev,
                    [geometry.id]: { status: "loading", label: null, address: null },
                };
            });

            reverseGeocodePresentPlace(point[0], point[1], controller.signal)
                .then((place) => {
                    setAdminLabels((prev) => ({
                        ...prev,
                        [geometry.id]: {
                            status: "loaded",
                            label: place.label,
                            address: place.address,
                        },
                    }));
                })
                .catch((err) => {
                    if (controller.signal.aborted) return;
                    console.warn("Reverse geocode historical geometry failed", err);
                    setAdminLabels((prev) => ({
                        ...prev,
                        [geometry.id]: { status: "error", label: null, address: null },
                    }));
                });
        }

        return () => controller.abort();
    }, [expandedItem, hasApiKey, mode]);

    const selectPrediction = async (prediction: PresentPlacePrediction) => {
        setSelectingPlaceId(prediction.placeId);
        setError(null);
        try {
            const place = await fetchPresentPlaceDetail(prediction.placeId);
            onFocusPlace(place);
            setQuery(place.name || prediction.description);
            setResults([]);
            setIsOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Không lấy được tọa độ địa điểm.");
        } finally {
            setSelectingPlaceId(null);
        }
    };

    const selectHistoricalEntity = (item: EntityGeometriesSearchItem) => {
        if (item.geometries.length === 1) {
            selectHistoricalGeometry(item, item.geometries[0]);
            return;
        }
        if (item.geometries.length > 1) {
            setExpandedEntityId((prev) => prev === item.entity_id ? null : item.entity_id);
        }
    };

    const selectHistoricalGeometry = (
        item: EntityGeometriesSearchItem,
        geometry: EntityGeometrySearchGeo
    ) => {
        setSelectingGeometryId(geometry.id);
        const labelState = adminLabels[geometry.id] || null;
        onFocusHistoricalGeometry({
            entity: item,
            geometry,
            representativePoint: getGeometryRepresentativePoint(geometry.draw_geometry),
            adminLabel: labelState?.label || null,
        });
        setHistoricalQuery(item.name);
        setHistoricalResults([]);
        setExpandedEntityId(null);
        setIsOpen(false);
        setSelectingGeometryId(null);
    };

    const clearSearch = () => {
        if (mode === "present") {
            setQuery("");
            setResults([]);
            setError(null);
        } else {
            setHistoricalQuery("");
            setHistoricalResults([]);
            setHistoricalError(null);
            setExpandedEntityId(null);
        }
        setIsOpen(false);
        onClearFocus();
    };

    const switchMode = (nextMode: SearchMode) => {
        setMode(nextMode);
        setIsOpen(true);
        setError(null);
        setHistoricalError(null);
    };

    return (
        <div
            style={{
                position: "absolute",
                top: 10,
                right: rightOffset,
                zIndex: 18,
                width: "min(392px, calc(100vw - 36px))",
                pointerEvents: "auto",
            }}
            onMouseDown={(event) => event.stopPropagation()}
        >
            <div style={searchCardStyle}>
                <div style={searchInputRowStyle}>
                    <button
                        type="button"
                        onClick={() => switchMode(mode === "present" ? "history" : "present")}
                        title={mode === "present" ? "Switch to history search" : "Switch to present search"}
                        aria-label={mode === "present" ? "Switch to history search" : "Switch to present search"}
                        style={modeSwitchStyle}
                    >
                        {mode === "present" ? "Present" : "History"}
                    </button>
                    <input
                        value={activeQuery}
                        onChange={(event) => {
                            if (mode === "present") {
                                setQuery(event.target.value);
                            } else {
                                setHistoricalQuery(event.target.value);
                            }
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                setIsOpen(false);
                                return;
                            }
                            if (event.key === "Enter") {
                                if (mode === "present" && results[0]) {
                                    event.preventDefault();
                                    void selectPrediction(results[0]);
                                }
                                if (mode === "history" && historicalResults[0]) {
                                    event.preventDefault();
                                    selectHistoricalEntity(historicalResults[0]);
                                }
                            }
                        }}
                        disabled={mode === "present" && !hasApiKey}
                        placeholder={mode === "present" ? "Tìm địa điểm hiện tại" : "Tìm entity lịch sử"}
                        style={inputStyle}
                    />
                    {activeQuery || focusedPlace ? (
                        <button
                            type="button"
                            onClick={clearSearch}
                            title="Clear"
                            aria-label="Clear place search"
                            style={clearButtonStyle}
                        >
                            x
                        </button>
                    ) : null}
                </div>
            </div>

            {isOpen && shouldRenderResults(mode, activeQuery, activeLoading, activeError, results, historicalResults) ? (
                <div style={resultsPanelStyle}>
                    {mode === "present" ? (
                        <PresentResults
                            isLoading={isLoading}
                            error={error}
                            query={query}
                            results={results}
                            selectingPlaceId={selectingPlaceId}
                            onSelect={selectPrediction}
                        />
                    ) : (
                        <HistoricalResults
                            isLoading={isHistoricalLoading}
                            error={historicalError}
                            query={historicalQuery}
                            results={historicalResults}
                            expandedEntityId={expandedEntityId}
                            adminLabels={adminLabels}
                            selectingGeometryId={selectingGeometryId}
                            hasApiKey={hasApiKey}
                            onSelectEntity={selectHistoricalEntity}
                            onSelectGeometry={selectHistoricalGeometry}
                        />
                    )}
                </div>
            ) : null}
        </div>
    );
}

function PresentResults({
    isLoading,
    error,
    query,
    results,
    selectingPlaceId,
    onSelect,
}: {
    isLoading: boolean;
    error: string | null;
    query: string;
    results: PresentPlacePrediction[];
    selectingPlaceId: string | null;
    onSelect: (prediction: PresentPlacePrediction) => Promise<void>;
}) {
    if (isLoading) return <div style={statusStyle}>Đang tìm...</div>;
    if (error) return <div style={{ ...statusStyle, color: "#fecaca" }}>{error}</div>;
    if (!results.length && query.trim().length >= 2) return <div style={statusStyle}>Không có kết quả.</div>;

    return (
        <>
            {results.map((result) => (
                <button
                    key={result.placeId}
                    type="button"
                    onClick={() => void onSelect(result)}
                    disabled={selectingPlaceId === result.placeId}
                    style={{
                        ...resultButtonStyle,
                        cursor: selectingPlaceId === result.placeId ? "wait" : "pointer",
                    }}
                    onMouseEnter={(event) => {
                        event.currentTarget.style.background = "rgba(56, 189, 248, 0.1)";
                    }}
                    onMouseLeave={(event) => {
                        event.currentTarget.style.background = "transparent";
                    }}
                >
                    <span style={primaryResultTextStyle}>{result.mainText}</span>
                    <span style={secondaryResultTextStyle}>{result.secondaryText || result.description}</span>
                </button>
            ))}
        </>
    );
}

function HistoricalResults({
    isLoading,
    error,
    query,
    results,
    expandedEntityId,
    adminLabels,
    selectingGeometryId,
    hasApiKey,
    onSelectEntity,
    onSelectGeometry,
}: {
    isLoading: boolean;
    error: string | null;
    query: string;
    results: EntityGeometriesSearchItem[];
    expandedEntityId: string | null;
    adminLabels: Record<string, AdminLabelState>;
    selectingGeometryId: string | null;
    hasApiKey: boolean;
    onSelectEntity: (item: EntityGeometriesSearchItem) => void;
    onSelectGeometry: (item: EntityGeometriesSearchItem, geometry: EntityGeometrySearchGeo) => void;
}) {
    if (isLoading) return <div style={statusStyle}>Đang tìm entity...</div>;
    if (error) return <div style={{ ...statusStyle, color: "#fecaca" }}>{error}</div>;
    if (!results.length && query.trim().length >= 2) return <div style={statusStyle}>Không có entity phù hợp.</div>;

    return (
        <>
            {results.map((item) => {
                const isExpanded = expandedEntityId === item.entity_id;
                return (
                    <div key={item.entity_id} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.12)" }}>
                        <button
                            type="button"
                            onClick={() => onSelectEntity(item)}
                            disabled={!item.geometries.length}
                            style={{
                                ...resultButtonStyle,
                                cursor: item.geometries.length ? "pointer" : "not-allowed",
                            }}
                            onMouseEnter={(event) => {
                                if (item.geometries.length) event.currentTarget.style.background = "rgba(56, 189, 248, 0.1)";
                            }}
                            onMouseLeave={(event) => {
                                event.currentTarget.style.background = "transparent";
                            }}
                        >
                            <span style={primaryResultTextStyle}>{item.name || item.entity_id}</span>
                            <span style={secondaryResultTextStyle}>
                                {item.geometries.length
                                    ? `${item.geometries.length} geometry${item.geometries.length > 1 ? "s" : ""}`
                                    : "Không có geometry"}
                                {item.description ? ` · ${item.description}` : ""}
                            </span>
                        </button>
                        {isExpanded ? (
                            <div style={{ padding: "0 8px 8px", display: "grid", gap: 6 }}>
                                {!hasApiKey ? (
                                    <div style={{ ...statusStyle, padding: "7px 8px" }}>
                                        Thiếu SEARCH_MAP_API_KEY để lấy địa danh hiện tại.
                                    </div>
                                ) : null}
                                {item.geometries.map((geometry) => (
                                    <button
                                        key={geometry.id}
                                        type="button"
                                        onClick={() => onSelectGeometry(item, geometry)}
                                        disabled={selectingGeometryId === geometry.id}
                                        style={{
                                            border: "1px solid rgba(148, 163, 184, 0.16)",
                                            borderRadius: 8,
                                            background: "rgba(15, 23, 42, 0.68)",
                                            color: "#e2e8f0",
                                            padding: "8px 9px",
                                            textAlign: "left",
                                            cursor: selectingGeometryId === geometry.id ? "wait" : "pointer",
                                        }}
                                    >
                                        <span style={{ ...primaryResultTextStyle, fontSize: 12 }}>
                                            {formatAdminLabel(adminLabels[geometry.id])}
                                        </span>
                                        <span style={{ ...secondaryResultTextStyle, marginTop: 3 }}>
                                            {formatGeometryMeta(geometry)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </>
    );
}

function shouldRenderResults(
    mode: SearchMode,
    query: string,
    isLoading: boolean,
    error: string | null,
    presentResults: PresentPlacePrediction[],
    historicalResults: EntityGeometriesSearchItem[]
): boolean {
    if (isLoading || error || query.trim().length >= 2) return true;
    return mode === "present" ? presentResults.length > 0 : historicalResults.length > 0;
}

function formatAdminLabel(state: AdminLabelState | undefined): string {
    if (!state || state.status === "loading") return "Đang lấy địa danh hiện tại...";
    if (state.status === "error") return "Không lấy được địa danh hiện tại";
    return state.label || state.address || "Địa danh hiện tại không rõ";
}

function formatGeometryMeta(geometry: EntityGeometrySearchGeo): string {
    const type = geometry.type || "geometry";
    const timeStart = geometry.time_start ?? null;
    const timeEnd = geometry.time_end ?? null;
    const time =
        timeStart !== null && timeEnd !== null
            ? `${timeStart} - ${timeEnd}`
            : timeStart !== null
                ? `từ ${timeStart}`
                : timeEnd !== null
                    ? `đến ${timeEnd}`
                    : "không rõ thời gian";
    return `${type} · ${time}`;
}

const searchCardStyle = {
    border: "1px solid rgba(148, 163, 184, 0.28)",
    borderRadius: 10,
    background: "rgba(15, 23, 42, 0.92)",
    boxShadow: "0 16px 36px rgba(2, 6, 23, 0.35)",
    color: "#e2e8f0",
    overflow: "hidden",
    backdropFilter: "blur(6px)",
} satisfies CSSProperties;

const searchInputRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 10px",
} satisfies CSSProperties;

const inputStyle = {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: 700,
} satisfies CSSProperties;

const modeSwitchStyle = {
    border: "none",
    borderRight: "1px solid rgba(148, 163, 184, 0.22)",
    background: "transparent",
    color: "#38bdf8",
    padding: "0 10px 0 0",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    lineHeight: 1,
} satisfies CSSProperties;

const clearButtonStyle = {
    width: 26,
    height: 26,
    border: "1px solid rgba(148, 163, 184, 0.28)",
    borderRadius: 6,
    background: "rgba(15, 23, 42, 0.74)",
    color: "#cbd5e1",
    cursor: "pointer",
    fontWeight: 900,
} satisfies CSSProperties;

const resultsPanelStyle = {
    marginTop: 8,
    overflow: "hidden",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: 10,
    background: "rgba(15, 23, 42, 0.96)",
    boxShadow: "0 16px 36px rgba(2, 6, 23, 0.4)",
    color: "#e2e8f0",
    backdropFilter: "blur(6px)",
} satisfies CSSProperties;

const resultButtonStyle = {
    display: "grid",
    gap: 3,
    width: "100%",
    padding: "10px 12px",
    border: "none",
    background: "transparent",
    color: "#e2e8f0",
    textAlign: "left",
} satisfies CSSProperties;

const primaryResultTextStyle = {
    display: "block",
    fontSize: 13,
    fontWeight: 900,
    overflowWrap: "anywhere",
} satisfies CSSProperties;

const secondaryResultTextStyle = {
    display: "block",
    fontSize: 11,
    color: "#94a3b8",
    lineHeight: 1.35,
    overflowWrap: "anywhere",
} satisfies CSSProperties;

const statusStyle = {
    padding: "11px 12px",
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 700,
} satisfies CSSProperties;
