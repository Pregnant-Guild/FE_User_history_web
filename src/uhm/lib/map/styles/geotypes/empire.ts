import { LayerSpecification } from "maplibre-gl";
import { buildPolygonGeotypeLayers } from "../shared/styleBuilders";

export function getEmpireLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pathArrowSourceId;
    void pointSourceId;
    return buildPolygonGeotypeLayers(sourceId, {
        typeId: "empire",
        fillColor: "#f59e0b",
        strokeColor: "#92400e",
        fillOpacity: 0.36,
        strokeWidth: { z1: 1.8, z4: 2.6, z6: 3.4 },
    });
}
