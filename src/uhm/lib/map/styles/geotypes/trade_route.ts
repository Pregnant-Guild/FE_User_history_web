import { LayerSpecification } from "maplibre-gl";
import { buildLineGeotypeLayers } from "./styleBuilders";

export function getTradeRouteLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void pointSourceId;
    return buildLineGeotypeLayers(sourceId, pathArrowSourceId, {
        typeId: "trade_route",
        color: "#eab308",
        strokeColor: "#854d0e",
        dasharray: [5, 3],
        arrowOpacity: 0.78,
    });
}
