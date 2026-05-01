import type { EntityGeometryPreset } from "@/uhm/lib/entityTypeOptions";

export type EditorMode =
    | "idle"
    | "draw"
    | "select"
    | "add-point"
    | "add-line"
    | "add-path"
    | "add-circle";

export type TimelineRange = {
    min: number;
    max: number;
};

export type EntityFormState = {
    name: string;
    slug: string;
    type_id: string;
};

export type GeometryMetaFormState = {
    time_start: string;
    time_end: string;
    binding: string;
};

export type PendingEntityCreate = {
    id: string;
    name: string;
    slug: string | null;
    type_id: string;
    status: number;
};

export type CreatedEntitySummary = {
    id: string;
    name: string;
    type_id?: string | null;
};

export type GeometryPreset = EntityGeometryPreset;

