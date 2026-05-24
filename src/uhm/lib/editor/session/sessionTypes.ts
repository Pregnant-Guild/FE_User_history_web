import type { GeometryPreset } from "@/uhm/lib/map/geo/geometryTypeOptions";

export type EditorMode =
    | "idle"
    | "draw"
    | "select"
    | "add-point"
    | "add-line"
    | "add-path"
    | "add-circle"
    | "replay"
    | "replay_preview";

export type TimelineRange = {
    min: number;
    max: number;
};

export type EntityFormState = {
    name: string;
    description: string;
    time_start: string;
    time_end: string;
};

export type GeometryMetaFormState = {
    type_key: string;
    time_start: string;
    time_end: string;
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
