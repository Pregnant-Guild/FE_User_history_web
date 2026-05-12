import { LayerSpecification } from "maplibre-gl";
import { TYPE_MATCH_EXPR } from "./index";

export function getDefenseLineLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        {
        id: "defense_line-line",
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", TYPE_MATCH_EXPR, "defense_line"]],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""], "#ef4444",
                "#f97316"
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 2.2, 4, 3.2, 6, 4.2],
            "line-dasharray": [3, 2],
            "line-opacity": 0.9
        }
    },
        {
        id: "defense_line-hit",
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", TYPE_MATCH_EXPR, "defense_line"]],
        paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 12, 4, 18, 6, 24],
            "line-opacity": 0
        }
    }
    ];
}
