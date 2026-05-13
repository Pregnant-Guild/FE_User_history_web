import { LayerSpecification } from "maplibre-gl";
import { buildLineGeotypeLayers } from "../shared/styleBuilders";

export function getRefugeeRouteLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pointSourceId;
    return buildLineGeotypeLayers(sourceId, pathArrowSourceId, {
        typeId: "refugee_route",
        color: "#f97316",
        strokeColor: "#9a3412",
        dasharray: [1, 2],
        opacity: 0.84,
        arrowOpacity: 0.72,
    });
}
