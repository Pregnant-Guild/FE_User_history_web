import { LayerSpecification } from "maplibre-gl";
import { TYPE_MATCH_EXPR } from "./index";

export function getBridgeLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        {
        id: "bridge-circle",
        type: "circle",
        source: pointSourceId!,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["==", TYPE_MATCH_EXPR, "bridge"]],
        paint: {
            "circle-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#22c55e",
                "#ef4444"
            ],
            "circle-radius": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 8, 4
            ],
            "circle-stroke-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#14532d",
                "#ffffff"
            ],
            "circle-stroke-width": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 3, 1
            ],
            "circle-opacity": 0.9
        }
    },
        {
        id: "bridge-selected-halo",
        type: "circle",
        source: pointSourceId!,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["==", TYPE_MATCH_EXPR, "bridge"]],
        paint: {
            "circle-color": "#22c55e",
            "circle-radius": 13,
            "circle-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 0.28, 0
            ],
            "circle-stroke-color": "#14532d",
            "circle-stroke-width": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 2, 0
            ]
        }
    }
    ];
}
