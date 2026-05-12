import { LayerSpecification } from "maplibre-gl";
import { TYPE_MATCH_EXPR } from "./index";

export function getRebellionZoneLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        {
        id: "rebellion_zone-fill",
        type: "fill",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "rebellion_zone"]],
        paint: {
            "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""], "#ef4444",
                "#7c3aed"
            ],
            "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 0.6,
                0.32
            ]
        }
    },
        {
        id: "rebellion_zone-line",
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "rebellion_zone"]],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#14532d",
                "#4c1d95"
            ],
            "line-width": 2
        }
    }
    ];
}
