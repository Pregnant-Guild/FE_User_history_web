import { ExpressionSpecification, FilterSpecification, LayerSpecification } from "maplibre-gl";
import { MAP_EMPHASIS_TEXT_FONT_STACK } from "../shared/textFonts";

const TYPE_MATCH_EXPR = ["coalesce", ["get", "type"], ["get", "entity_type_id"], ""] as unknown as ExpressionSpecification;
const POINT_GEOMETRY_FILTER = [
    "any",
    ["==", ["geometry-type"], "Point"],
    ["==", ["geometry-type"], "MultiPoint"],
] as unknown as FilterSpecification;

const SELECTED_EXPR = ["boolean", ["feature-state", "selected"], false] as unknown as ExpressionSpecification;
const SELECTED_COLOR = "#22c55e";

export function getRegionLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void sourceId;
    void pathArrowSourceId;

    const typeId = "region";
    const filter = ["all", POINT_GEOMETRY_FILTER, ["==", TYPE_MATCH_EXPR, typeId]] as unknown as FilterSpecification;

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
