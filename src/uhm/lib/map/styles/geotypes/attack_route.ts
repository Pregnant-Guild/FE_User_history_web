import { LayerSpecification } from "maplibre-gl";
import { buildLineGeotypeLayers } from "./styleBuilders";

export function getAttackRouteLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pointSourceId;
    return buildLineGeotypeLayers(sourceId, pathArrowSourceId, {
        typeId: "attack_route",
        color: "#ef4444",
        strokeColor: "#7f1d1d",
        width: { z1: 2.6, z4: 3.8, z6: 5 },
        arrowOpacity: 0.9,
    });
}
