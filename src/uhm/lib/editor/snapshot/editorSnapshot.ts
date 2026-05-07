import { DEFAULT_ENTITY_TYPE_ID } from "@/uhm/lib/entityTypeOptions";
import { typeKeyToGeoTypeCode } from "@/uhm/lib/geoTypeMap";
import type { Change } from "@/uhm/lib/editor/draft/editorTypes";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { Feature, FeatureCollection, GeometryEntitySnapshot, GeometrySnapshot } from "@/uhm/types/geo";
import type { EditorSnapshot, Section } from "@/uhm/types/sections";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/sections";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function getStringId(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return "";
}

function getRefId(value: unknown): string {
    if (!isRecord(value)) return "";
    return typeof value.id === "string" ? value.id : "";
}

export function normalizeEditorSnapshot(raw: unknown): EditorSnapshot | null {
    if (!isRecord(raw)) return null;
    const snapshot = raw as UnknownRecord;

    // Accept legacy snapshots (v1) and new ones (v2+). We only require that a FeatureCollection,
    // if present, is structurally valid. Everything else is treated as optional.
    const fcRaw = snapshot.editor_feature_collection;
    const fc: FeatureCollection | undefined =
        isRecord(fcRaw) && fcRaw.type === "FeatureCollection" && Array.isArray(fcRaw.features)
            ? (fcRaw as unknown as FeatureCollection)
            : undefined;

    const entitiesRaw = snapshot.entities;
    const entities: EntitySnapshot[] | undefined = Array.isArray(entitiesRaw)
        ? entitiesRaw
            .filter(isRecord)
            .map((e) => {
                const id = getStringId(e.id);
                const opRaw = typeof e.operation === "string" ? e.operation : undefined;
                const operation: EntitySnapshot["operation"] =
                    opRaw === "delete" ? "delete" : "reference";
                const existingSource = e.source === "inline" || e.source === "ref" ? e.source : undefined;
                const refId = getRefId(e.ref);
                const source: "inline" | "ref" =
                    existingSource || (refId || opRaw === "reference" ? "ref" : "inline");
                const rest: UnknownRecord = { ...e };
                delete rest.ref;

                return {
                    ...(rest as unknown as Omit<EntitySnapshot, "id" | "source" | "operation">),
                    id,
                    source,
                    operation,
                };
            })
        : undefined;

    const geometriesRaw = snapshot.geometries;
    const geometries: GeometrySnapshot[] | undefined = Array.isArray(geometriesRaw)
        ? geometriesRaw
            .filter(isRecord)
            .map((g) => {
                const id = getStringId(g.id);
                const opRaw = typeof g.operation === "string" ? g.operation : undefined;
                const operation: GeometrySnapshot["operation"] =
                    opRaw === "delete" ? "delete" : "reference";
                const existingSource = g.source === "inline" || g.source === "ref" ? g.source : undefined;
                const refId = getRefId(g.ref);
                const hasInlineGeometry = "draw_geometry" in g || "geometry" in g;
                const source: "inline" | "ref" = existingSource || (refId || !hasInlineGeometry ? "ref" : "inline");
                const rest: UnknownRecord = { ...g };
                delete rest.ref;

                return {
                    ...(rest as unknown as Omit<GeometrySnapshot, "id" | "source" | "operation">),
                    id,
                    source,
                    operation,
                };
            })
        : undefined;

    const wikisRaw = snapshot.wikis;
    const wikis: WikiSnapshot[] | undefined = Array.isArray(wikisRaw)
        ? wikisRaw
            .filter(isRecord)
            .map((w) => {
                const id = typeof w.id === "string" ? w.id : "";
                const opRaw = typeof w.operation === "string" ? w.operation : undefined;
                const operation: WikiSnapshot["operation"] =
                    opRaw === "delete" ? "delete" : "reference";
                const existingSource = w.source === "inline" || w.source === "ref" ? w.source : undefined;
                const refId = getRefId(w.ref);
                const source: "inline" | "ref" =
                    existingSource || (refId || opRaw === "reference" ? "ref" : "inline");
                const rest: UnknownRecord = { ...w };
                delete rest.ref;

                return {
                    ...(rest as unknown as Omit<WikiSnapshot, "id" | "source" | "operation">),
                    id,
                    source,
                    operation,
                };
            })
        : undefined;

    // Legacy snapshots used link_scopes[{geometry_id, operation, entity_ids[]}]. New snapshots prefer
    // geometry_entity[{geometry_id, entity_id}]. If geometry_entity is missing but link_scopes exists,
    // migrate it by expanding each entity_id into a join row.
    const geometryEntityRaw = snapshot.geometry_entity;
    const geometryEntity: GeometryEntitySnapshot[] | undefined = Array.isArray(geometryEntityRaw)
        ? geometryEntityRaw
            .filter(isRecord)
            .map((r) => {
                const geometry_id = getStringId(r.geometry_id);
                const entity_id = typeof r.entity_id === "string" ? r.entity_id : "";
                return {
                    ...(r as unknown as Omit<GeometryEntitySnapshot, "geometry_id" | "entity_id">),
                    geometry_id,
                    entity_id,
                };
            })
            .filter((r) => r.geometry_id.length > 0 && r.entity_id.length > 0)
        : undefined;

    const legacyLinkScopes = snapshot.link_scopes;
    const migratedGeometryEntity: GeometryEntitySnapshot[] | undefined =
        !geometryEntity && Array.isArray(legacyLinkScopes)
            ? legacyLinkScopes
                .filter(isRecord)
                .flatMap((s) => {
                    const geometry_id = getStringId(s.geometry_id);
                    const entity_ids = Array.isArray(s.entity_ids)
                        ? s.entity_ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                        : [];
                    return entity_ids.map((entity_id) => ({ geometry_id, entity_id: entity_id.trim() }))
                        .filter((row) => row.geometry_id.length > 0 && row.entity_id.length > 0);
                })
            : undefined;

    const entityWikisRaw = snapshot.entity_wiki ?? snapshot.entity_wikis;
    const entityWikis: EntityWikiLinkSnapshot[] | undefined = Array.isArray(entityWikisRaw)
        ? entityWikisRaw
            .filter(isRecord)
            .map((r) => {
                const entity_id = typeof r.entity_id === "string" ? r.entity_id : "";
                const wiki_id = typeof r.wiki_id === "string" ? r.wiki_id : "";
                const opRaw = typeof r.operation === "string" ? r.operation : "";
                const isDeleted =
                    typeof r.is_deleted === "number"
                        ? r.is_deleted === 1
                        : typeof r.is_deleted === "boolean"
                            ? r.is_deleted
                            : false;
                const operation: "binding" | "delete" =
                    opRaw === "delete"
                        ? "delete"
                        : opRaw === "binding" || opRaw === "reference"
                            ? "binding"
                            : isDeleted
                                ? "delete"
                                : "binding";
                return { entity_id, wiki_id, operation };
            })
            .filter((r) => r.entity_id.length > 0 && r.wiki_id.length > 0)
        : undefined;

    // For editor UX, re-hydrate entity ids on features from geometry_entity. Snapshot persistence does not
    // store entity_id/entity_ids/entity_names on features anymore.
    const fcForEditor: FeatureCollection | undefined = (() => {
        if (!fc) return undefined;
        if (!geometryEntity && !migratedGeometryEntity) return fc;
        const links = geometryEntity || migratedGeometryEntity || [];
        const byGeom = new Map<string, string[]>();
        for (const row of links) {
            const list = byGeom.get(row.geometry_id) || [];
            list.push(row.entity_id);
            byGeom.set(row.geometry_id, list);
        }
        const cloned = JSON.parse(JSON.stringify(fc)) as FeatureCollection;
        for (const feature of cloned.features) {
            const gid = String(feature.properties.id);
            const entity_ids = byGeom.get(gid) || [];
            if (entity_ids.length) {
                const props = feature.properties as unknown as UnknownRecord;
                props.entity_ids = entity_ids;
                props.entity_id = entity_ids[0];
            }
        }
        return cloned;
    })();

    return {
        ...(snapshot as unknown as EditorSnapshot),
        editor_feature_collection: fcForEditor,
        entities,
        geometries,
        wikis,
        geometry_entity: geometryEntity || migratedGeometryEntity,
        entity_wiki: entityWikis,
    };
}

export function buildEditorSnapshot(options: {
    section: Section;
    draft: FeatureCollection;
    changes: Change[];
    snapshotEntities: EntitySnapshot[];
    snapshotWikis: WikiSnapshot[];
    snapshotEntityWikiLinks: EntityWikiLinkSnapshot[];
    previousSnapshot: EditorSnapshot | null;
    hasPersistedFeature: (id: Feature["properties"]["id"]) => boolean;
}): EditorSnapshot {
    const changedIds = new Set(options.changes.map((change) =>
        String(change.action === "create" ? change.feature.properties.id : change.id)
    ));
    const deletedIds = new Set(
        options.changes
            .filter((change): change is Extract<Change, { action: "delete" }> => change.action === "delete")
            .map((change) => String(change.id))
    );
    const currentDraftIds = new Set(options.draft.features.map((feature) => String(feature.properties.id)));
    const previousFeatures = new globalThis.Map<string, Feature>();
    for (const feature of options.previousSnapshot?.editor_feature_collection?.features || []) {
        previousFeatures.set(String(feature.properties.id), feature);
        if (!currentDraftIds.has(String(feature.properties.id))) {
            deletedIds.add(String(feature.properties.id));
        }
    }

    const previousGeometryOps = new globalThis.Map<string, GeometrySnapshot["operation"]>();
    for (const item of options.previousSnapshot?.geometries || []) {
        const id = typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : "";
        const operation = item.operation;
        if (id && operation) previousGeometryOps.set(id, operation);
    }

    const entityRows = new globalThis.Map<string, EntitySnapshot>();

    // Persist inline entity records across commits even when they're not currently bound.
    // Without this, "create entity" can disappear on the next commit unless the entity is referenced
    // by geometry_entity/entity_wiki or pinned via projectEntityRefs.
    for (const prev of options.previousSnapshot?.entities || []) {
        if (!prev) continue;
        const id = typeof prev.id === "string" || typeof prev.id === "number" ? String(prev.id) : "";
        if (!id || entityRows.has(id)) continue;
        if (prev.operation === "delete") continue;
        if (prev.source !== "inline") continue;
        // Carry forward as current-state inline entity; operation is a per-commit delta signal.
        const cloned = JSON.parse(JSON.stringify(prev)) as EntitySnapshot;
        const { operation: _op, ...rest } = cloned;
        entityRows.set(id, {
            ...rest,
            id,
            source: "inline",
            operation: "reference",
        });
    }
    for (const row of options.snapshotEntities || []) {
        if (!row) continue;
        const id = typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : "";
        if (!id) continue;
        const cloned = JSON.parse(JSON.stringify(row)) as EntitySnapshot;
        const name =
            typeof cloned?.name === "string" && cloned.name.trim().length
                ? cloned.name.trim()
                : id;
        const source: "inline" | "ref" = cloned.source === "inline" ? "inline" : "ref";
        entityRows.set(id, {
            ...cloned,
            id,
            source,
            name,
            operation: cloned.operation ?? "reference",
        });
    }

    // Entities referenced by wiki links should be present as "reference" too.
    for (const link of options.snapshotEntityWikiLinks || []) {
        const id = typeof link?.entity_id === "string" ? link.entity_id : "";
        if (!id || entityRows.has(id)) continue;
        entityRows.set(id, {
            id,
            source: "ref",
            operation: "reference",
            name: id,
            slug: null,
            description: null,
            status: 1,
        });
    }

    for (const feature of options.draft.features) {
        for (const entityId of normalizeFeatureEntityIds(feature)) {
            if (entityRows.has(entityId)) continue;
            entityRows.set(entityId, {
                id: entityId,
                source: "ref",
                operation: "reference",
                name: entityId,
                slug: null,
                description: null,
                status: 1,
            });
        }
    }

    const geometries: GeometrySnapshot[] = options.draft.features.map((feature) => {
        const id = String(feature.properties.id);
        const previousOperation = previousGeometryOps.get(id);
        const previousFeature = previousFeatures.get(id);
        const changedFromPreviousSnapshot = previousFeature
            ? JSON.stringify(previousFeature) !== JSON.stringify(feature)
            : false;
        const operation: GeometrySnapshot["operation"] =
            previousOperation === "create"
                ? "create"
                : !previousFeature && (options.previousSnapshot || !options.hasPersistedFeature(feature.properties.id))
                    ? "create"
                    : changedIds.has(id) || changedFromPreviousSnapshot
                        ? "update"
                        : undefined;
        const bbox = getFeatureBBox(feature);
        const typeKey = feature.properties.type || getDefaultTypeIdForFeature(feature);
        const typeCode = typeKeyToGeoTypeCode(typeKey);
        return {
            id,
            operation,
            source: "inline",
            // BE currently expects geometries[].type as a string. We send the geo_type SMALLINT code as a string.
            type: String(typeCode ?? 0),
            draw_geometry: feature.geometry,
            binding: normalizeFeatureBindingIds(feature),
            time_start: feature.properties.time_start ?? null,
            time_end: feature.properties.time_end ?? null,
            bbox: bbox
                ? {
                    min_lng: bbox.minLng,
                    min_lat: bbox.minLat,
                    max_lng: bbox.maxLng,
                    max_lat: bbox.maxLat,
                }
                : null,
        };
    });

    for (const id of deletedIds) {
        geometries.push({
            id,
            source: "ref",
            operation: "delete",
        });
    }

    const geometryEntityRaw: GeometryEntitySnapshot[] = options.draft.features.flatMap((feature) => {
        const geometry_id = String(feature.properties.id);
        const entityIds = normalizeFeatureEntityIds(feature);
        return entityIds.map((entity_id) => ({ geometry_id, entity_id }));
    });
    const geometryEntity = dedupeAndSortGeometryEntity(geometryEntityRaw);

    // Persist snapshot without denormalized entity fields on features (many-to-many lives in geometry_entity[]).
    const draftForSnapshot = JSON.parse(JSON.stringify(options.draft)) as FeatureCollection;
    for (const feature of draftForSnapshot.features) {
        const p = feature.properties as unknown as UnknownRecord;
        delete p.entity_id;
        delete p.entity_ids;
        delete p.entity_name;
        delete p.entity_names;
        delete p.entity_type_id;
    }

    const previousWikis = new globalThis.Map<string, WikiSnapshot>();
    for (const item of options.previousSnapshot?.wikis || []) {
        if (!item || typeof item !== "object") continue;
        const id = (item as WikiSnapshot).id;
        if (typeof id === "string" && id.length > 0) previousWikis.set(id, item as WikiSnapshot);
    }

    // Wikis in snapshot_json are treated as current state (not a delta-table like geometries[]).
    // Operation semantics:
    // - create/update/delete: this commit changes the wiki itself
    // - reference: this wiki is a ref used for linking (entity<->wiki), not a modification
    const wikis: WikiSnapshot[] = (options.snapshotWikis || [])
        .filter((w) => {
            if (!w || typeof w.id !== "string" || w.id.trim().length === 0) return false;
            if (w.source === "ref") return true;
            // Keep explicit operations (e.g. delete) even if content is empty.
            if (w.operation === "create" || w.operation === "update" || w.operation === "delete") return true;
            // Inline wiki with no content: don't persist it (treat as not written).
            const title = typeof w.title === "string" ? w.title.trim() : "";
            const doc = typeof w.doc === "string" ? w.doc.trim() : "";
            return title.length > 0 || (w.doc !== null && doc.length > 0);
        })
        .map((w) => {
            const prev = previousWikis.get(w.id) || null;
            const cloned = JSON.parse(JSON.stringify(w)) as WikiSnapshot;

            // Ref wiki: always mark as reference (used for linking, not changed here).
            if (cloned.source === "ref") {
                cloned.operation = "reference";
                return cloned;
            }

            // Inline wiki: if explicitly marked create/update/delete by UI, keep it.
            if (cloned.operation === "create" || cloned.operation === "update" || cloned.operation === "delete") {
                return cloned;
            }

            // Inline wiki with no explicit operation: mark update only if changed; otherwise omit operation.
            if (!prev) {
                // New wiki that somehow has no op set: treat as create.
                cloned.operation = "create";
                return cloned;
            }

            const changed = (() => {
                try {
                    const prevComparable = { title: prev.title, doc: prev.doc };
                    const nextComparable = { title: cloned.title, doc: cloned.doc };
                    return JSON.stringify(prevComparable) !== JSON.stringify(nextComparable);
                } catch {
                    return true;
                }
            })();

            cloned.operation = changed ? "update" : undefined;
            return cloned;
        });

    const entityWikisRaw: EntityWikiLinkSnapshot[] = (options.snapshotEntityWikiLinks || [])
        .filter((l) => l && typeof l.entity_id === "string" && typeof l.wiki_id === "string")
        .map((l) => ({
            entity_id: l.entity_id,
            wiki_id: l.wiki_id,
            operation: l.operation === "delete" ? "delete" : "binding",
        }));
    const entityWikis = dedupeAndSortEntityWiki(entityWikisRaw);

    return {
        editor_feature_collection: draftForSnapshot,
        entities: Array.from(entityRows.values()).sort((a, b) => String(a.id).localeCompare(String(b.id))),
        geometries: geometries.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
        geometry_entity: geometryEntity,
        wikis: wikis.slice().sort((a, b) => a.id.localeCompare(b.id)),
        entity_wiki: entityWikis,
    };
}

function dedupeAndSortGeometryEntity(rows: GeometryEntitySnapshot[]): GeometryEntitySnapshot[] {
    const seen = new Set<string>();
    const deduped: GeometryEntitySnapshot[] = [];
    for (const row of rows) {
        const geometry_id = typeof row.geometry_id === "string" ? row.geometry_id : "";
        const entity_id = typeof row.entity_id === "string" ? row.entity_id : "";
        if (!geometry_id || !entity_id) continue;
        const key = `${geometry_id}::${entity_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({ ...row, geometry_id, entity_id });
    }
    deduped.sort((a, b) => {
        const g = a.geometry_id.localeCompare(b.geometry_id);
        if (g !== 0) return g;
        return a.entity_id.localeCompare(b.entity_id);
    });
    return deduped;
}

function dedupeAndSortEntityWiki(rows: EntityWikiLinkSnapshot[]): EntityWikiLinkSnapshot[] {
    const seen = new Set<string>();
    const deduped: EntityWikiLinkSnapshot[] = [];
    for (const row of rows) {
        const entity_id = typeof row.entity_id === "string" ? row.entity_id : "";
        const wiki_id = typeof row.wiki_id === "string" ? row.wiki_id : "";
        if (!entity_id || !wiki_id) continue;
        const operation = row.operation === "delete" ? "delete" : "binding";
        const key = `${entity_id}::${wiki_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({ entity_id, wiki_id, operation });
    }
    deduped.sort((a, b) => {
        const e = a.entity_id.localeCompare(b.entity_id);
        if (e !== 0) return e;
        return a.wiki_id.localeCompare(b.wiki_id);
    });
    return deduped;
}

export function getDefaultTypeIdForFeature(feature: Feature): string {
    const preset = feature.properties.geometry_preset;
    if (preset === "line") return "defense_line";
    if (preset === "point") return "city";
    if (preset === "circle-area") return "war";
    if (preset === "polygon") return DEFAULT_ENTITY_TYPE_ID;

    const geometryType = feature.geometry.type;
    if (geometryType === "LineString" || geometryType === "MultiLineString") {
        return "defense_line";
    }
    if (geometryType === "Point" || geometryType === "MultiPoint") {
        return "city";
    }
    return DEFAULT_ENTITY_TYPE_ID;
}

export function normalizeFeatureEntityIds(feature: Feature): string[] {
    const fromArray = Array.isArray(feature.properties.entity_ids)
        ? feature.properties.entity_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];

    if (fromArray.length) {
        return uniqueEntityIds(fromArray);
    }

    const single = feature.properties.entity_id;
    if (typeof single === "string" && single.trim().length > 0) {
        return [single.trim()];
    }

    return [];
}

export function normalizeFeatureBindingIds(feature: Feature): string[] {
    const rawBinding = feature.properties.binding;
    if (!Array.isArray(rawBinding)) return [];
    return uniqueEntityIds(rawBinding
        .map((id) => {
            if (typeof id !== "string" && typeof id !== "number") return "";
            return String(id).trim();
        })
        .filter((id) => id.length > 0));
}

export function parseBindingInput(raw: string): string[] {
    if (!raw.trim().length) return [];
    return uniqueEntityIds(
        raw
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
    );
}

export function uniqueEntityIds(ids: string[]): string[] {
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const rawId of ids) {
        const id = rawId.trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        deduped.push(id);
    }
    return deduped;
}

function getFeatureBBox(feature: Feature): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
    const points = collectCoordinatePairs(feature.geometry.coordinates);
    if (!points.length) return null;
    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    for (const [lng, lat] of points) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
    }
    return { minLng, minLat, maxLng, maxLat };
}

function collectCoordinatePairs(value: unknown): Array<[number, number]> {
    if (!Array.isArray(value)) return [];
    if (
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number" &&
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1])
    ) {
        return [[value[0], value[1]]];
    }
    return value.flatMap((item) => collectCoordinatePairs(item));
}
