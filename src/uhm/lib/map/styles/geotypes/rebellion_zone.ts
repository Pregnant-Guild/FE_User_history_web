import { LayerSpecification } from "maplibre-gl";
import { buildPolygonGeotypeLayers } from "./styleBuilders";

export function getRebellionZoneLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pathArrowSourceId;
    void pointSourceId;
    return buildPolygonGeotypeLayers(sourceId, {
        typeId: "rebellion_zone",
        fillColor: "#a21caf",
        strokeColor: "#701a75",
        fillOpacity: 0.26,
        dasharray: [3, 2],
    });
}
