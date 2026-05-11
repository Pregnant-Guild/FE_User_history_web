import type {
    Feature,
    FeatureProperties,
    Geometry,
    GeometryChange,
} from "@/uhm/types/geo";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/projects";

export type Change = GeometryChange;

export type UndoAction =
    | { type: "update"; id: FeatureProperties["id"]; prevGeometry: Geometry }
    | { type: "properties"; id: FeatureProperties["id"]; prevProperties: FeatureProperties }
    | { type: "delete"; feature: Feature }
    | { type: "create"; id: FeatureProperties["id"] }
    // Snapshot-scoped undo (affects commit snapshot but not GeoJSON draft directly)
    | { type: "snapshot_entities"; label: string; prev: EntitySnapshot[] }
    | { type: "snapshot_wikis"; label: string; prev: WikiSnapshot[] }
    | { type: "snapshot_entity_wiki"; label: string; prev: EntityWikiLinkSnapshot[] };
