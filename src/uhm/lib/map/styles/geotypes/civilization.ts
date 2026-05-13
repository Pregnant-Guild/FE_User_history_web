import { LayerSpecification } from "maplibre-gl";
import { buildPolygonGeotypeLayers } from "../shared/styleBuilders";

export function getCivilizationLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pathArrowSourceId;
    void pointSourceId;
    return buildPolygonGeotypeLayers(sourceId, {
        typeId: "civilization",
        fillColor: "#14b8a6",
        strokeColor: "#134e4a",
        fillOpacity: 0.34,
    });
}
