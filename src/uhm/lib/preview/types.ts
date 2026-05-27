import type { Entity } from "@/uhm/api/entities";
import type { Wiki } from "@/uhm/api/wikis";
import type { FeatureCollection } from "@/uhm/types/geo";

export type PreviewDataScope = "project-snapshot" | "public-atlas";

export type PreviewRelationIndex = {
    entitiesById: Record<string, Entity>;
    entityGeometriesById: Record<string, FeatureCollection>;
    entityWikisById: Record<string, Wiki[]>;
    geometryEntityIds: Record<string, string[]>;
    wikiEntityIdsById: Record<string, string[]>;
    wikiEntityIdsBySlug: Record<string, string[]>;
    wikiById: Record<string, Wiki>;
    wikiBySlug: Record<string, Wiki>;
};

export const EMPTY_PREVIEW_RELATIONS: PreviewRelationIndex = {
    entitiesById: {},
    entityGeometriesById: {},
    entityWikisById: {},
    geometryEntityIds: {},
    wikiEntityIdsById: {},
    wikiEntityIdsBySlug: {},
    wikiById: {},
    wikiBySlug: {},
};

