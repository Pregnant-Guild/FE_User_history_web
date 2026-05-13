import { LayerSpecification } from "maplibre-gl";
import { buildPolygonGeotypeLayers } from "../shared/styleBuilders";

export function getWarLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pathArrowSourceId;
    void pointSourceId;
    return buildPolygonGeotypeLayers(sourceId, {
        typeId: "war",
        fillColor: "#dc2626",
        strokeColor: "#7f1d1d",
        fillOpacity: 0.26,
        dasharray: [5, 2],
    });
}
