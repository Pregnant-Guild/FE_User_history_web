import { LayerSpecification } from "maplibre-gl";
import { TYPE_MATCH_EXPR } from "./index";

export function getTradeRouteLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        {
        id: "trade_route-line",
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", TYPE_MATCH_EXPR, "trade_route"]],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""], "#ef4444",
                "#eab308"
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 2.2, 4, 3.2, 6, 4.2],
            "line-opacity": 0.9
        }
    },
        {
        id: "trade_route-hit",
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", TYPE_MATCH_EXPR, "trade_route"]],
        paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 12, 4, 18, 6, 24],
            "line-opacity": 0
        }
    },
        {
        id: "trade_route-path-arrow-fill",
        type: "fill",
        source: pathArrowSourceId!,
        filter: ["==", TYPE_MATCH_EXPR, "trade_route"],
        paint: {
            "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#22c55e",
                ["==", ["coalesce", ["get", "entity_id"], ""], ""], "#ef4444",
                "#eab308"
            ],
            "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 0.92,
                0.82
            ]
        }
    },
        {
        id: "trade_route-path-arrow-line",
        type: "line",
        source: pathArrowSourceId!,
        filter: ["==", TYPE_MATCH_EXPR, "trade_route"],
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#14532d",
                "#0f172a"
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.45, 4, 0.8, 6, 1.2],
            "line-opacity": 0.9
        }
    }
    ];
}
