import { LayerSpecification } from "maplibre-gl";
import { buildLineGeotypeLayers } from "../shared/styleBuilders";

export function getDefenseLineLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pointSourceId;
    return buildLineGeotypeLayers(sourceId, pathArrowSourceId, {
        typeId: "defense_line",
        color: "#38bdf8",
        strokeColor: "#075985",
        dasharray: [3, 2],
        arrow: false,
    });
}
