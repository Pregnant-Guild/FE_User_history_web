import { LayerSpecification } from "maplibre-gl";
import { buildPointGeotypeLayers } from "./pointStyle";

export function getCityLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void sourceId;
    void pathArrowSourceId;
    return buildPointGeotypeLayers("city", pointSourceId!);
}
