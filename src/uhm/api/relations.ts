import { API_ENDPOINTS } from "@/uhm/api/config";
import { requestJson } from "@/uhm/api/http";
import type { Entity } from "@/uhm/api/entities";
import type { Wiki } from "@/uhm/api/wikis";
import type { Geometry } from "@/uhm/types/geo";

const RELATION_BATCH_SIZE = 10;
const RELATION_BATCH_CONCURRENCY = 4;

export type WikiContentPreview = {
    id: string;
    preview?: string | null;
    created_at?: string | null;
};

export type RelationGeometry = {
    id: string;
    draw_geometry: Geometry;
    type?: string | null;
    geo_type?: number | null;
    bound_with?: string | null;
    time_start?: number | null;
    time_end?: number | null;
};

type RelationType =
    | "wiki-entity"
    | "entity-wiki"
    | "geometry-entity"
    | "entity-geometry"
    | "entity-geometry-child"
    | "entity-geometry-alone";

const entitiesPromiseCache: Record<string, Promise<Entity[]>> = {};

export async function fetchRelationMap<T>(type: RelationType, ids: string[]): Promise<Record<string, T[]>> {
    const uniqueIds = uniqueStrings(ids);
    if (!uniqueIds.length) return {};
    return requestJson<Record<string, T[]>>(
        `${API_ENDPOINTS.relations}?type=${encodeURIComponent(type)}&${buildArrayQuery("ids", uniqueIds)}`
    );
}

export async function fetchEntitiesByWikiIds(ids: string[]): Promise<Record<string, Entity[]>> {
    return fetchRelationMap<Entity>("wiki-entity", ids);
}

export async function fetchGeometriesByEntityIds(ids: string[]): Promise<Record<string, RelationGeometry[]>> {
    return fetchRelationMap<RelationGeometry>("entity-geometry", ids);
}

export async function fetchEntitiesByGeometryIds(ids: string[]): Promise<Record<string, Entity[]>> {
    const uniqueIds = uniqueStrings(ids);
    const missingIds = uniqueIds.filter(id => !entitiesPromiseCache[id]);

    if (missingIds.length > 0) {
        const batchPromise = (async () => {
            const result: Record<string, Entity[]> = {};
            const pages = await mapWithConcurrency(
                chunkIds(missingIds),
                RELATION_BATCH_CONCURRENCY,
                (batch) => requestJson<Record<string, Entity[]>>(
                    `${API_ENDPOINTS.relations}/entities-by-geometries?${buildArrayQuery("geometry_ids", batch)}`
                )
            );
            for (const rows of pages) {
                mergeRelationRecord(result, rows);
            }
            return result;
        })();
        batchPromise.catch(() => {});

        for (const id of missingIds) {
            entitiesPromiseCache[id] = batchPromise
                .then(res => res[id] || [])
                .catch(err => {
                    // Xóa khỏi cache để lần sau thử lại
                    delete entitiesPromiseCache[id];
                    // Trả về [] để không làm sập Promise.all của UI
                    return [];
                });
        }
    }

    const result: Record<string, Entity[]> = {};
    await Promise.all(uniqueIds.map(async id => {
        result[id] = await entitiesPromiseCache[id];
    }));
    return result;
}

export async function fetchWikisByEntityIds(ids: string[]): Promise<Record<string, Wiki[]>> {
    const result: Record<string, Wiki[]> = {};
    const pages = await mapWithConcurrency(
        chunkIds(ids),
        RELATION_BATCH_CONCURRENCY,
        (batch) => requestJson<Record<string, Wiki[]>>(
            `${API_ENDPOINTS.relations}/wikis-by-entities?${buildArrayQuery("entity_ids", batch)}`
        )
    );
    for (const rows of pages) {
        mergeRelationRecord(result, rows);
    }
    return result;
}

export async function fetchWikiContentPreviewsByIds(ids: string[]): Promise<WikiContentPreview[]> {
    const result: WikiContentPreview[] = [];
    const seen = new Set<string>();
    const pages = await mapWithConcurrency(
        chunkIds(ids),
        RELATION_BATCH_CONCURRENCY,
        (batch) => requestJson<WikiContentPreview[]>(
            `${API_ENDPOINTS.relations}/wiki-contents/preview?${buildArrayQuery("ids", batch)}`
        )
    );
    for (const rows of pages) {
        for (const row of rows || []) {
            const id = String(row?.id || "").trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            result.push(row);
        }
    }
    return result;
}

const wikisWithPreviewPromiseCache: Record<string, Promise<Wiki[]>> = {};

export async function fetchWikisByEntityIdsWithPreviews(ids: string[]): Promise<Record<string, Wiki[]>> {
    const uniqueIds = uniqueStrings(ids);
    const missingIds = uniqueIds.filter(id => !wikisWithPreviewPromiseCache[id]);

    if (missingIds.length > 0) {
        const batchPromise = (async () => {
            const wikisByEntityId = await fetchWikisByEntityIds(missingIds);
            const previewContentIds = uniqueStrings(
                Object.values(wikisByEntityId || {})
                    .flat()
                    .map((wiki) => wiki.content_sample?.[0]?.id)
            );
            if (!previewContentIds.length) return wikisByEntityId;

            const previews = await fetchWikiContentPreviewsByIds(previewContentIds);
            const previewById = new Map(
                previews.map((item) => [String(item.id), String(item.preview || "").trim()])
            );

            const result: Record<string, Wiki[]> = {};
            for (const [entityId, wikis] of Object.entries(wikisByEntityId || {})) {
                result[entityId] = (wikis || []).map((wiki) => {
                    const previewId = wiki.content_sample?.[0]?.id;
                    const preview = previewId ? previewById.get(String(previewId)) || "" : "";
                    return preview ? { ...wiki, preview_quote: preview } : wiki;
                });
            }
            return result;
        })();
        batchPromise.catch(() => {});

        for (const id of missingIds) {
            wikisWithPreviewPromiseCache[id] = batchPromise
                .then(res => res[id] || [])
                .catch(err => {
                    // Xóa khỏi cache để lần sau thử lại
                    delete wikisWithPreviewPromiseCache[id];
                    // Trả về [] để không làm sập Promise.all của UI
                    return [];
                });
        }
    }

    const result: Record<string, Wiki[]> = {};
    await Promise.all(uniqueIds.map(async id => {
        result[id] = await wikisWithPreviewPromiseCache[id];
    }));
    return result;
}

function buildArrayQuery(key: string, values: string[]): string {
    const query = new URLSearchParams();
    for (const value of uniqueStrings(values)) {
        query.append(key, value);
    }
    return query.toString();
}

function chunkIds(ids: string[]): string[][] {
    const values = uniqueStrings(ids);
    const chunks: string[][] = [];
    for (let index = 0; index < values.length; index += RELATION_BATCH_SIZE) {
        chunks.push(values.slice(index, index + RELATION_BATCH_SIZE));
    }
    return chunks;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(
        values
            .map((value) => String(value || "").trim())
            .filter((value) => value.length > 0)
    ));
}

function mergeRelationRecord<T>(target: Record<string, T[]>, source: Record<string, T[]> | undefined) {
    for (const [key, rows] of Object.entries(source || {})) {
        target[key] = rows || [];
    }
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    const runnerCount = Math.max(1, Math.min(Math.trunc(concurrency), items.length));
    let nextIndex = 0;

    await Promise.all(
        Array.from({ length: runnerCount }, async () => {
            while (true) {
                const current = nextIndex++;
                if (current >= items.length) return;
                results[current] = await worker(items[current]);
            }
        })
    );

    return results;
}
