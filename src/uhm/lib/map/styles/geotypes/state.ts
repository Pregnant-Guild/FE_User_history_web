import { LayerSpecification } from "maplibre-gl";
import { buildPolygonGeotypeLayers } from "../shared/styleBuilders";

export function getStateLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pathArrowSourceId;
    void pointSourceId;
    return buildPolygonGeotypeLayers(sourceId, {
        typeId: "state",
        fillColor: "#0891b2",
        strokeColor: "#0e7490",
        fillOpacity: 0.28,
        strokeWidth: { z1: 1.1, z4: 1.7, z6: 2.4 },
    });
}
