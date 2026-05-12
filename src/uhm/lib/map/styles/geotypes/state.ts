import { LayerSpecification } from "maplibre-gl";
import { TYPE_MATCH_EXPR } from "./index";

export function getStateLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        {
        id: "state-fill",
        type: "fill",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "state"]],
        paint: {
            "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""], "#ef4444",
                "#0ea5e9"
            ],
            "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 0.6,
                0.5
            ]
        }
    },
        {
        id: "state-line",
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "state"]],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#14532d",
                "#0c4a6e"
            ],
            "line-width": 2
        }
    }
    ];
}
