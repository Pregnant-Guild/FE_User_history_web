import { LayerSpecification } from "maplibre-gl";
import { buildPolygonGeotypeLayers } from "./styleBuilders";

export function getCountryLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pathArrowSourceId;
    void pointSourceId;
    return buildPolygonGeotypeLayers(sourceId, {
        typeId: "country",
        fillColor: "#2563eb",
        strokeColor: "#1e40af",
        fillOpacity: 0.34,
    });
}
