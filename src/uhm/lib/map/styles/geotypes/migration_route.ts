import { LayerSpecification } from "maplibre-gl";
import { buildLineGeotypeLayers } from "../shared/styleBuilders";

export function getMigrationRouteLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pointSourceId;
    return buildLineGeotypeLayers(sourceId, pathArrowSourceId, {
        typeId: "migration_route",
        color: "#10b981",
        strokeColor: "#065f46",
        dasharray: [4, 3],
        arrowOpacity: 0.76,
    });
}
