import { LayerSpecification } from "maplibre-gl";
import { buildPointGeotypeLayers } from "../shared/pointStyle";

export function getPersonEventLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void sourceId;
    void pathArrowSourceId;
    return buildPointGeotypeLayers("person_event", pointSourceId!);
}
