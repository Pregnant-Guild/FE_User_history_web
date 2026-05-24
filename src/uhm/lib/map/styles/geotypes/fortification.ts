import { LayerSpecification } from "maplibre-gl";
import { buildPointGeotypeLayers } from "../shared/pointStyle";

export function getFortificationLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void sourceId;
    void pathArrowSourceId;
    return buildPointGeotypeLayers("fortification", pointSourceId!);
}
