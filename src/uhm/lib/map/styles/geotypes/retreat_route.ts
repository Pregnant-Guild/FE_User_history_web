import { LayerSpecification } from "maplibre-gl";
import { buildLineGeotypeLayers } from "../shared/styleBuilders";

export function getRetreatRouteLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pointSourceId;
    return buildLineGeotypeLayers(sourceId, pathArrowSourceId, {
        typeId: "retreat_route",
        color: "#94a3b8",
        strokeColor: "#475569",
        dasharray: [6, 3],
        opacity: 0.82,
        arrowOpacity: 0.68,
        showLine: false,
    });
}
