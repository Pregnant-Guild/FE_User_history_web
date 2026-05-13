import { LayerSpecification } from "maplibre-gl";

export function getPolygonLabelLayers(sourceId: string): LayerSpecification[] {
    return [
        {
            id: "polygon-labels-text",
            type: "symbol",
            source: sourceId,
            layout: {
                "text-field": ["coalesce", ["get", "polygon_label"], ""],
                "text-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    1, 12,
                    4, 15,
                    6, 18,
                ],
                "text-anchor": "center",
                "text-allow-overlap": true,
                "text-ignore-placement": true,
                "text-max-width": 14,
                "symbol-placement": "point",
            },
            paint: {
                "text-color": "#f8fafc",
                "text-halo-color": "#0f172a",
                "text-halo-width": 1.6,
                "text-halo-blur": 0.35,
            },
        },
    ];
}
