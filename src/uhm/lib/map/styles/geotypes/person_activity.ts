import { LayerSpecification } from "maplibre-gl";
import { buildPointGeotypeLayers } from "../shared/pointStyle";

export function getPersonActivityLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    void sourceId;
    void pathArrowSourceId;
    return buildPointGeotypeLayers("person_activity", pointSourceId!);
}
