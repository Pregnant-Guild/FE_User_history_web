import { LayerSpecification } from "maplibre-gl";
import { TYPE_MATCH_EXPR } from "./index";

export function getEmpireLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        {
        id: "empire-fill",
        type: "fill",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "empire"]],
        paint: {
            "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""], "#ef4444",
                "#f59e0b"
            ],
            "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 0.6,
                0.5
            ]
        }
    },
        {
        id: "empire-line",
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", TYPE_MATCH_EXPR, "empire"]],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#14532d",
                "#7c2d12"
            ],
            "line-width": 2
        }
    }
    ];
}
