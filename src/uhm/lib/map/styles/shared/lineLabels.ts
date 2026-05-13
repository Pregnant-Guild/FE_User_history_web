import maplibregl, { LayerSpecification } from "maplibre-gl";

const LINE_GEOMETRY_FILTER: maplibregl.ExpressionSpecification = [
    "any",
    ["==", ["geometry-type"], "LineString"],
    ["==", ["geometry-type"], "MultiLineString"],
];

export function getLineLabelLayers(sourceId: string): LayerSpecification[] {
    return [
        {
            id: "line-labels-text",
            type: "symbol",
            source: sourceId,
            filter: ["all", LINE_GEOMETRY_FILTER, ["!=", ["coalesce", ["get", "line_label"], ""], ""]],
            layout: {
                "symbol-placement": "line",
                "symbol-spacing": 280,
                "text-field": ["coalesce", ["get", "line_label"], ""],
                "text-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    1, 11,
                    4, 13,
                    6, 15,
                ],
                "text-keep-upright": true,
                "text-max-angle": 35,
                "text-max-width": 12,
                "text-padding": 2,
                "text-allow-overlap": false,
                "text-ignore-placement": false,
                "text-optional": true,
            },
            paint: {
                "text-color": "#f8fafc",
                "text-halo-color": "#0f172a",
                "text-halo-width": 1.4,
                "text-halo-blur": 0.25,
            },
        },
    ];
}
