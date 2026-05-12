import { LayerSpecification } from "maplibre-gl";
import { buildPolygonGeotypeLayers } from "./styleBuilders";

export function getBattleLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pathArrowSourceId;
    void pointSourceId;
    return buildPolygonGeotypeLayers(sourceId, {
        typeId: "battle",
        fillColor: "#f43f5e",
        strokeColor: "#9f1239",
        fillOpacity: 0.3,
        strokeWidth: { z1: 1.5, z4: 2.2, z6: 3 },
    });
}
