import { LayerSpecification } from "maplibre-gl";
import { buildLineGeotypeLayers } from "./styleBuilders";

export function getInvasionRouteLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pointSourceId;
    return buildLineGeotypeLayers(sourceId, pathArrowSourceId, {
        typeId: "invasion_route",
        color: "#be123c",
        strokeColor: "#4c0519",
        width: { z1: 2.8, z4: 4.1, z6: 5.4 },
        arrowOpacity: 0.9,
    });
}
