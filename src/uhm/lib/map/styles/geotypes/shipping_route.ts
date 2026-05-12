import { LayerSpecification } from "maplibre-gl";
import { buildLineGeotypeLayers } from "./styleBuilders";

export function getShippingRouteLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pointSourceId;
    return buildLineGeotypeLayers(sourceId, pathArrowSourceId, {
        typeId: "shipping_route",
        color: "#0ea5e9",
        strokeColor: "#075985",
        width: { z1: 2.4, z4: 3.5, z6: 4.7 },
        dasharray: [7, 4],
        arrowOpacity: 0.8,
    });
}
