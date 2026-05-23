import maplibregl, { LayerSpecification } from "maplibre-gl";

const TYPE_MATCH_EXPR: maplibregl.ExpressionSpecification = ["coalesce", ["get", "type"], ["get", "entity_type_id"], ""];
const SELECTED_EXPR: maplibregl.ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];

const SELECTED_COLOR = "#22c55e";

type ZoomStops = {
    z1: number;
    z4: number;
    z6: number;
};

type LineGeotypeStyle = {
    typeId: string;
    color: string;
    strokeColor?: string;
    opacity?: number;
    width?: ZoomStops;
    dasharray?: number[];
    arrow?: boolean;
    arrowOpacity?: number;
    arrowOutlineColor?: string;
    arrowOutlineWidth?: ZoomStops;
};

type PolygonGeotypeStyle = {
    typeId: string;
    fillColor: string;
    strokeColor: string;
    fillOpacity: number;
    strokeWidth?: ZoomStops;
    dasharray?: number[];
};

const DEFAULT_LINE_WIDTH: ZoomStops = { z1: 2.2, z4: 3.2, z6: 4.2 };
const DEFAULT_ARROW_OUTLINE_WIDTH: ZoomStops = { z1: 0.45, z4: 0.8, z6: 1.2 };
const DEFAULT_POLYGON_STROKE_WIDTH: ZoomStops = { z1: 1.4, z4: 2, z6: 2.8 };
const LINE_GEOMETRY_FILTER: maplibregl.ExpressionSpecification = [
    "any",
    ["==", ["geometry-type"], "LineString"],
    ["==", ["geometry-type"], "MultiLineString"],
];
const POLYGON_GEOMETRY_FILTER: maplibregl.ExpressionSpecification = [
    "any",
    ["==", ["geometry-type"], "Polygon"],
    ["==", ["geometry-type"], "MultiPolygon"],
];

export function buildLineGeotypeLayers(
    sourceId: string,
    pathArrowSourceId: string | undefined,
    style: LineGeotypeStyle
): LayerSpecification[] {
    const lineLayer: LayerSpecification = {
        id: `${style.typeId}-line`,
        type: "line",
        source: sourceId,
        filter: lineFilter(style.typeId),
        layout: {
            "line-cap": "round",
            "line-join": "round",
        },
        paint: {
            "line-color": statusColor(style.color),
            "line-width": widthStops(style.width ?? DEFAULT_LINE_WIDTH),
            "line-opacity": style.opacity ?? 0.9,
            ...(style.dasharray ? { "line-dasharray": style.dasharray } : {}),
        },
    };

    const hitLayer: LayerSpecification = {
        id: `${style.typeId}-hit`,
        type: "line",
        source: sourceId,
        filter: lineFilter(style.typeId),
        layout: {
            "line-cap": "round",
            "line-join": "round",
        },
        paint: {
            "line-color": "#ffffff",
            "line-width": widthStops({ z1: 12, z4: 18, z6: 24 }),
            "line-opacity": 0,
        },
    };

    if (style.arrow === false || !pathArrowSourceId) {
        return [lineLayer, hitLayer];
    }

    return [
        lineLayer,
        hitLayer,
        {
            id: `${style.typeId}-path-arrow-fill`,
            type: "fill",
            source: pathArrowSourceId,
            filter: ["==", TYPE_MATCH_EXPR, style.typeId],
            paint: {
                "fill-color": statusFillColor(style.color),
                "fill-opacity": [
                    "case",
                    SELECTED_EXPR,
                    0.92,
                    style.arrowOpacity ?? 0.82,
                ],
            },
        },
        {
            id: `${style.typeId}-path-arrow-line`,
            type: "line",
            source: pathArrowSourceId,
            filter: ["==", TYPE_MATCH_EXPR, style.typeId],
            layout: {
                "line-cap": "round",
                "line-join": "round",
            },
            paint: {
                "line-color": statusStroke(style.arrowOutlineColor ?? style.strokeColor ?? "#0f172a"),
                "line-width": widthStops(style.arrowOutlineWidth ?? DEFAULT_ARROW_OUTLINE_WIDTH),
                "line-opacity": 0.9,
            },
        },
    ];
}

export function buildPolygonGeotypeLayers(
    sourceId: string,
    style: PolygonGeotypeStyle
): LayerSpecification[] {
    return [
        {
            id: `${style.typeId}-fill`,
            type: "fill",
            source: sourceId,
            filter: polygonFilter(style.typeId),
            paint: {
                "fill-color": statusFillColor(style.fillColor),
                "fill-opacity": [
                    "case",
                    SELECTED_EXPR,
                    0.58,
                    style.fillOpacity,
                ],
            },
        },
        {
            id: `${style.typeId}-line`,
            type: "line",
            source: sourceId,
            filter: polygonFilter(style.typeId),
            layout: {
                "line-cap": "round",
                "line-join": "round",
            },
            paint: {
                "line-color": statusStroke(style.strokeColor),
                "line-width": widthStops(style.strokeWidth ?? DEFAULT_POLYGON_STROKE_WIDTH),
                "line-opacity": 0.95,
                ...(style.dasharray ? { "line-dasharray": style.dasharray } : {}),
            },
        },
    ];
}

function statusColor(normalColor: string): maplibregl.ExpressionSpecification {
    return [
        "case",
        SELECTED_EXPR,
        SELECTED_COLOR,
        normalColor,
    ];
}

function statusStroke(normalColor: string): maplibregl.ExpressionSpecification {
    return [
        "case",
        SELECTED_EXPR,
        SELECTED_COLOR,
        normalColor,
    ];
}

function statusFillColor(normalColor: string): string {
    return normalColor;
}

function lineFilter(typeId: string): maplibregl.ExpressionSpecification {
    return ["all", LINE_GEOMETRY_FILTER, ["==", TYPE_MATCH_EXPR, typeId]];
}

function polygonFilter(typeId: string): maplibregl.ExpressionSpecification {
    return ["all", POLYGON_GEOMETRY_FILTER, ["==", TYPE_MATCH_EXPR, typeId]];
}

function widthStops(stops: ZoomStops): maplibregl.ExpressionSpecification {
    return ["interpolate", ["linear"], ["zoom"], 1, stops.z1, 4, stops.z4, 6, stops.z6];
}
