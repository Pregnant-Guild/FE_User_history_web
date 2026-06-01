import { LayerSpecification } from "maplibre-gl";
import { MAP_EMPHASIS_TEXT_FONT_STACK } from "../shared/textFonts";

const TYPE_MATCH_EXPR: any = ["coalesce", ["get", "type"], ["get", "entity_type_id"], ""];
const POINT_GEOMETRY_FILTER: any = [
    "any",
    ["==", ["geometry-type"], "Point"],
    ["==", ["geometry-type"], "MultiPoint"],
];
const SELECTED_EXPR: any = ["boolean", ["feature-state", "selected"], false];
const SELECTED_COLOR = "#22c55e";

export function getLocationLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void sourceId;
    void pathArrowSourceId;

    const typeId = "location";
    const filter: any = ["all", POINT_GEOMETRY_FILTER, ["==", TYPE_MATCH_EXPR, typeId]];

    return [
        {
            id: `${typeId}-selected-halo`,
            type: "circle",
            source: pointSourceId!,
            filter: filter,
            minzoom: 5,
            paint: {
                "circle-color": "#e2e8f0",
                "circle-radius": ["case", SELECTED_EXPR, 18, 0],
                "circle-opacity": ["case", SELECTED_EXPR, 0.24, 0],
                "circle-blur": ["case", SELECTED_EXPR, 0.8, 0],
                "circle-stroke-color": "#64748b",
                "circle-stroke-width": ["case", SELECTED_EXPR, 1.6, 0],
                "circle-stroke-opacity": ["case", SELECTED_EXPR, 0.48, 0],
            },
        },
        {
            id: `${typeId}-circle`,
            type: "circle",
            source: pointSourceId!,
            filter: filter,
            minzoom: 5,
            paint: {
                "circle-color": [
                    "case",
                    SELECTED_EXPR,
                    SELECTED_COLOR,
                    ["coalesce", ["get", "entity_color"], "#e2e8f0"],
                ],
                "circle-radius": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    1, 2.5,
                    4, 3.5,
                    6, 4.5,
                ],
                "circle-stroke-color": [
                    "case",
                    SELECTED_EXPR,
                    SELECTED_COLOR,
                    ["coalesce", ["get", "entity_color"], "#475569"],
                ],
                "circle-stroke-width": 1.5,
            },
        },
        {
            id: `${typeId}-label`,
            type: "symbol",
            source: pointSourceId!,
            filter: filter,
            minzoom: 5,
            layout: {
                "text-font": [...MAP_EMPHASIS_TEXT_FONT_STACK],
                "text-field": ["coalesce", ["get", "point_label"], ""],
                "text-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    1, 10.5,
                    4, 12,
                    6, 14,
                ],
                "text-anchor": "top",
                "text-offset": [0, 0.6],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
                "text-optional": true,
                "text-max-width": 12,
            },
            paint: {
                "text-color": "#f8fafc",
                "text-halo-color": "#0f172a",
                "text-halo-width": 1.4,
                "text-halo-blur": 0.3,
            },
        }
    ];
}
