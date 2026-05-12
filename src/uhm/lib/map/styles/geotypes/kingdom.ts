import { LayerSpecification } from "maplibre-gl";
import { TYPE_MATCH_EXPR } from "./index";

export function getKingdomLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        {
        id: "kingdom-fill",
        type: "fill",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "kingdom"]],
        paint: {
            "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""], "#ef4444",
                "#d97706"
            ],
            "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 0.6,
                0.5
            ]
        }
    },
        {
        id: "kingdom-line",
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "kingdom"]],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#14532d",
                "#9a3412"
            ],
            "line-width": 2
        }
    }
    ];
}
