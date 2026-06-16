import type { Entity } from "@/uhm/api/entities";
import type { RelationGeometry } from "@/uhm/api/relations";
import type { Wiki } from "@/uhm/api/wikis";
import type { FeatureCollection } from "@/uhm/types/geo";
import { getGeometryRepresentativePoint } from "@/uhm/components/map/mapUtils";
import { reverseGeocodePresentPlace } from "@/uhm/api/goongPlaces";

export interface GeometrySelectionRow {
    entity: Entity;
    geometries: Array<{
        id: string;
        center: [number, number] | null;
        adminLabel: string | null;
        adminAddress: string | null;
    }>;
    featureCollection: FeatureCollection;
}

export function cleanWikiPreviewQuote(raw: string | null | undefined): string {
    const decoded = decodeHtmlEntities(String(raw || ""));
    const blockquote = extractWikiBlockquoteText(decoded);
    return cleanWikiPlainText(blockquote || decoded);
}

export function extractWikiBlockquoteText(content: string | null | undefined): string {
    if (!content) return "";

    const decoded = decodeHtmlEntities(content);
    const blockquoteMatch = decoded.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
    const rawText = blockquoteMatch?.[1]?.trim() || "";
    if (!rawText) return "";

    return cleanWikiPlainText(rawText);
}

export function cleanWikiPlainText(raw: string): string {
    return decodeHtmlEntities(raw)
        .replace(/<[^>]*>/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function decodeHtmlEntities(raw: string): string {
    return raw
        .replace(/&nbsp;/gi, " ")
        .replace(/&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/gi, "'");
}

export async function buildGeometrySelectionRows(
    entities: Entity[],
    geometriesByEntityId: Record<string, RelationGeometry[]>
): Promise<GeometrySelectionRow[]> {
    return Promise.all(entities.map(async (entity) => {
        const geometries = geometriesByEntityId[entity.id] || [];
        const displayGeometries = await Promise.all(geometries.map(async (geometry) => {
            const center = geometry.draw_geometry ? getGeometryRepresentativePoint(geometry.draw_geometry) : null;
            if (!center) {
                return {
                    id: geometry.id,
                    center: null,
                    adminLabel: null,
                    adminAddress: null,
                };
            }

            try {
                const place = await reverseGeocodePresentPlace(center[0], center[1]);
                return {
                    id: geometry.id,
                    center,
                    adminLabel: place.label,
                    adminAddress: place.address,
                };
            } catch {
                return {
                    id: geometry.id,
                    center,
                    adminLabel: null,
                    adminAddress: null,
                };
            }
        }));

        return {
            entity,
            geometries: displayGeometries,
            featureCollection: relationGeometriesToFeatureCollection(geometries),
        };
    }));
}

export function filterRelationGeometriesByEarliestStartTime(
    source: Record<string, RelationGeometry[]>
): Record<string, RelationGeometry[]> {
    const result: Record<string, RelationGeometry[]> = {};

    for (const [entityId, geometries] of Object.entries(source)) {
        const rows = (geometries || []).filter((geometry) => Boolean(geometry?.id && geometry.draw_geometry));
        if (!rows.length) {
            result[entityId] = [];
            continue;
        }

        const timedRows = rows.filter((geometry) => Number.isFinite(geometry.time_start));
        const candidateRows = timedRows.length ? timedRows : rows;
        const minStartTime = Math.min(...candidateRows.map((geometry) =>
            Number.isFinite(geometry.time_start) ? Number(geometry.time_start) : Number.POSITIVE_INFINITY
        ));

        result[entityId] = Number.isFinite(minStartTime)
            ? candidateRows.filter((geometry) => Number(geometry.time_start) === minStartTime)
            : candidateRows;
    }

    return result;
}

export function relationGeometriesToFeatureCollection(geometries: RelationGeometry[]): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: geometries
            .filter((geometry) => Boolean(geometry?.id && geometry.draw_geometry))
            .map((geometry) => ({
                type: "Feature" as const,
                properties: {
                    id: geometry.id,
                    type: geometry.type,
                    time_start: geometry.time_start,
                    time_end: geometry.time_end,
                    bound_with: geometry.bound_with,
                },
                geometry: geometry.draw_geometry,
            })),
    };
}

export function getFeatureCollectionMinTimeStart(fc: FeatureCollection): number | null {
    const values = fc.features
        .map((feature) => feature.properties.time_start)
        .filter((value): value is number => Number.isFinite(value));
    if (!values.length) return null;
    return Math.min(...values);
}

export function getEntityPreferredTimeStart(entity: Entity | null, fallbackGeometries: FeatureCollection): number | null {
    if (Number.isFinite(entity?.time_start)) {
        return Number(entity?.time_start);
    }
    return getFeatureCollectionMinTimeStart(fallbackGeometries);
}

export function findRelationWikiBySlug(source: Record<string, Wiki>, slug: string): Wiki | undefined {
    const direct = source[slug];
    if (direct) return direct;

    const target = normalizeWikiSlugForCompare(slug);
    if (!target) return undefined;
    return Object.entries(source).find(([key, wiki]) =>
        normalizeWikiSlugForCompare(key) === target ||
        normalizeWikiSlugForCompare(wiki.slug) === target
    )?.[1];
}

export function findRelationEntityIdsByWikiSlug(source: Record<string, string[]>, slug: string): string[] {
    const direct = source[slug];
    if (direct?.length) return direct;

    const target = normalizeWikiSlugForCompare(slug);
    if (!target) return [];
    for (const [key, ids] of Object.entries(source)) {
        if (normalizeWikiSlugForCompare(key) === target) return ids;
    }
    return [];
}

export function normalizeWikiSlugForCompare(value: string | null | undefined): string {
    let raw = String(value || "").trim();
    if (!raw) return "";
    try {
        raw = decodeURIComponent(raw);
    } catch {
        // Keep the original value if it is not valid percent-encoded text.
    }
    return raw
        .replace(/^\/+/, "")
        .replace(/^wiki\//i, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("vi-VN");
}

export function cloneStringArrayRecord(source: Record<string, string[]>): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(source)) {
        result[key] = [...value];
    }
    return result;
}

export function appendUnique(target: Record<string, string[]>, key: string, value: string) {
    if (!target[key]) {
        target[key] = [value];
        return;
    }
    if (!target[key].includes(value)) target[key].push(value);
}
