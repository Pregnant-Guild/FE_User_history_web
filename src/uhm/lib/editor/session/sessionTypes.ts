import type { GeometryPreset } from "@/uhm/lib/map/geo/geometryTypeOptions";

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
    description: string;
};

export type GeometryMetaFormState = {
    type_key: string;
    time_start: string;
    time_end: string;
    binding: string;
};

export type PendingEntityCreate = {
    id: string;
    name: string;
    description: string | null;
    status: number;
};

export type CreatedEntitySummary = {
    id: string;
    name: string;
};

export type { GeometryPreset };
