import { LayerSpecification } from "maplibre-gl";
import { buildPolygonGeotypeLayers } from "../shared/styleBuilders";

export function getKingdomLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pathArrowSourceId;
    void pointSourceId;
    return buildPolygonGeotypeLayers(sourceId, {
        typeId: "kingdom",
        fillColor: "#8b5cf6",
        strokeColor: "#6d28d9",
        fillOpacity: 0.34,
    });
}
