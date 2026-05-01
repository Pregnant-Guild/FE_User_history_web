import type {
    Feature,
    FeatureProperties,
    Geometry,
    GeometryChange,
} from "@/uhm/types/geo";

export type Change = GeometryChange;

export type UndoAction =
    | { type: "update"; id: FeatureProperties["id"]; prevGeometry: Geometry }
    | { type: "properties"; id: FeatureProperties["id"]; prevProperties: FeatureProperties }
    | { type: "delete"; feature: Feature }
    | { type: "create"; id: FeatureProperties["id"] };

