import { LayerSpecification } from "maplibre-gl";
import { buildPointGeotypeLayers } from "./pointStyle";

export function getPortLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void sourceId;
    void pathArrowSourceId;
    return buildPointGeotypeLayers("port", pointSourceId!);
}
