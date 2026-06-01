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

export function getRegionLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void sourceId;
    void pathArrowSourceId;

    const typeId = "region";
    const filter: any = ["all", POINT_GEOMETRY_FILTER, ["==", TYPE_MATCH_EXPR, typeId]];

    return [
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
                    1, 11,
                    4, 13,
                    6, 16,
                ],
                "text-anchor": "center",
                "text-allow-overlap": true,
                "text-ignore-placement": true,
                "text-max-width": 12,
            },
            paint: {
                "text-color": [
                    "case",
                    SELECTED_EXPR,
                    SELECTED_COLOR,
                    "#f8fafc",
                ],
                "text-halo-color": "#0f172a",
                "text-halo-width": 1.6,
                "text-halo-blur": 0.5,
            },
        }
    ];
}
