import { LayerSpecification } from "maplibre-gl";
import { buildPolygonGeotypeLayers } from "../shared/styleBuilders";

export function getFactionLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pathArrowSourceId;
    void pointSourceId;
    return buildPolygonGeotypeLayers(sourceId, {
        typeId: "faction",
        fillColor: "#f97316",
        strokeColor: "#9a3412",
        fillOpacity: 0.3,
        strokeWidth: { z1: 1.6, z4: 2.3, z6: 3.1 },
        dasharray: [2, 1.5],
    });
}
