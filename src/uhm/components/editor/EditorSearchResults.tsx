"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Entity } from "@/uhm/api/entities";
import type { EntityGeometriesSearchItem, EntityGeometrySearchGeo } from "@/uhm/api/geometries";
import type { Wiki } from "@/uhm/api/wikis";
import UnifiedSearchBar, { type UnifiedSearchKind } from "@/uhm/components/ui/UnifiedSearchBar";

type EditorSearchResultsProps = {
    searchKind: UnifiedSearchKind;
    onSearchKindChange: (kind: UnifiedSearchKind) => void;
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    onLocalSearchQueryChange: (query: string) => void;
    searchQueryDraft: string;
    entitySearchResults: Entity[];
    isEntitySearchLoading: boolean;
    onAddEntityRefToProject: (entity: Entity) => void;
    wikiSearchResults: Wiki[];
    isWikiSearching: boolean;
    onAddWikiRefToProject: (wiki: Wiki) => void;
    geoSearchResults: EntityGeometriesSearchItem[];
    isGeoSearching: boolean;
    onImportGeoFromSearch: (
        entityItem: EntityGeometriesSearchItem,
        geo: EntityGeometrySearchGeo
    ) => void;
};

export function EditorSearchResults({
    searchKind,
    onSearchKindChange,
    searchQuery,
    onSearchQueryChange,
    onLocalSearchQueryChange,
    searchQueryDraft,
    entitySearchResults,
    isEntitySearchLoading,
    onAddEntityRefToProject,
    wikiSearchResults,
    isWikiSearching,
    onAddWikiRefToProject,
    geoSearchResults,
    isGeoSearching,
    onImportGeoFromSearch,
}: EditorSearchResultsProps) {
    // Draft query quyết định có render kết quả hay không; query chính đã debounce ở page.
    const hasQuery = searchQueryDraft.trim().length > 0;

    return (
        <>
            <UnifiedSearchBar
                kind={searchKind}
                onKindChange={onSearchKindChange}
                query={searchQuery}
                onQueryChange={onSearchQueryChange}
                onLocalQueryChange={onLocalSearchQueryChange}
            />

            {searchKind === "entity" && hasQuery ? (
                <SearchBox
                    title="Entity Results"
                    status={isEntitySearchLoading ? "Searching..." : `${entitySearchResults.length} results`}
                >
                    {entitySearchResults.slice(0, 8).map((entity) => (
                        <ResultRow
                            key={entity.id}
                            title={entity.name}
                            subtitle={entity.id}
                            actionLabel="Add"
                            actionTitle="Add entity ref to project snapshot"
                            onAction={() => onAddEntityRefToProject(entity)}
                        />
                    ))}
                    {!isEntitySearchLoading && entitySearchResults.length === 0 ? <EmptyResult /> : null}
                </SearchBox>
            ) : null}

            {searchKind === "wiki" && hasQuery ? (
                <SearchBox
                    title="Wiki Results"
                    status={isWikiSearching ? "Searching..." : `${wikiSearchResults.length} results`}
                >
                    {wikiSearchResults.slice(0, 8).map((wiki) => (
                        <ResultRow
                            key={wiki.id}
                            title={(wiki.title || "").trim() || "Untitled wiki"}
                            subtitle={wiki.id}
                            actionLabel="Add"
                            actionTitle="Add wiki ref to project snapshot"
                            onAction={() => onAddWikiRefToProject(wiki)}
                        />
                    ))}
                    {!isWikiSearching && wikiSearchResults.length === 0 ? <EmptyResult /> : null}
                </SearchBox>
            ) : null}

            {searchKind === "geo" && hasQuery ? (
                <SearchBox
                    title="Geo Results"
                    status={isGeoSearching ? "Searching..." : `${geoSearchResults.length} entities`}
                >
                    {geoSearchResults.slice(0, 6).map((item) => (
                        <GeoResultGroup
                            key={item.entity_id}
                            item={item}
                            onImportGeoFromSearch={onImportGeoFromSearch}
                        />
                    ))}
                    {!isGeoSearching && geoSearchResults.length === 0 ? <EmptyResult /> : null}
                </SearchBox>
            ) : null}
        </>
    );
}

function SearchBox({
    title,
    status,
    children,
}: {
    title: string;
    status: string;
    children: ReactNode;
}) {
    return (
        <div style={{ padding: 10, background: "#0b1220", borderRadius: 8, border: "1px solid #1f2937" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "white" }}>{title}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{status}</div>
            </div>
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>{children}</div>
        </div>
    );
}

function ResultRow({
    title,
    subtitle,
    actionLabel,
    actionTitle,
    onAction,
}: {
    title: string;
    subtitle: string;
    actionLabel: string;
    actionTitle: string;
    onAction: () => void;
}) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 8,
                borderRadius: 6,
                border: "1px solid #1f2937",
                background: "transparent",
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#e5e7eb", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {title}
                </div>
                <div style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {subtitle}
                </div>
            </div>
            <button
                type="button"
                onClick={onAction}
                style={actionButtonStyle}
                title={actionTitle}
            >
                {actionLabel}
            </button>
        </div>
    );
}

function GeoResultGroup({
    item,
    onImportGeoFromSearch,
}: {
    item: EntityGeometriesSearchItem;
    onImportGeoFromSearch: (
        entityItem: EntityGeometriesSearchItem,
        geo: EntityGeometrySearchGeo
    ) => void;
}) {
    const geometries = Array.isArray(item.geometries) ? item.geometries : [];

    return (
        <div
            style={{
                padding: 8,
                borderRadius: 6,
                border: "1px solid #1f2937",
                background: "transparent",
                display: "grid",
                gap: 6,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.name?.trim() || item.entity_id}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.entity_id}
                    </div>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", flex: "0 0 auto" }}>
                    {geometries.length} geos
                </div>
            </div>
            {item.description?.trim() ? (
                <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.35 }}>
                    {item.description.trim()}
                </div>
            ) : null}
            {geometries.length ? (
                <div style={{ display: "grid", gap: 6, maxHeight: 200, overflowY: "auto", paddingRight: 4 }}>
                    {geometries.map((geo) => (
                        <div
                            key={geo.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                padding: 8,
                                borderRadius: 6,
                                border: "1px solid #243244",
                                background: "#0f172a",
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{ color: "#e5e7eb", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    #{geo.id}
                                </div>
                                <div style={{ color: "#94a3b8", fontSize: 11 }}>
                                    type: {geo.type || "unknown"}{" "}
                                    {geo.time_start != null || geo.time_end != null
                                        ? `| time: ${geo.time_start ?? "?"} -> ${geo.time_end ?? "?"}`
                                        : ""}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onImportGeoFromSearch(item, geo)}
                                style={{ ...actionButtonStyle, flex: "0 0 auto" }}
                                title="Import geometry into current editor draft"
                            >
                                Import
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No geometry linked.</div>
            )}
        </div>
    );
}

function EmptyResult() {
    return <div style={{ fontSize: 12, color: "#94a3b8" }}>No results.</div>;
}

const actionButtonStyle: CSSProperties = {
    border: "none",
    background: "#111827",
    color: "#93c5fd",
    cursor: "pointer",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 12,
    fontWeight: 700,
};
