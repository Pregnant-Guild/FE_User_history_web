import { LayerSpecification } from "maplibre-gl";
import { TYPE_MATCH_EXPR } from "./index";

export function getBattleLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        {
        id: "battle-fill",
        type: "fill",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "battle"]],
        paint: {
            "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""], "#ef4444",
                "#f43f5e"
            ],
            "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 0.6,
                0.34
            ]
        }
    },
        {
        id: "battle-line",
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "battle"]],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#14532d",
                "#9f1239"
            ],
            "line-width": 2
        }
    }
    ];
}
