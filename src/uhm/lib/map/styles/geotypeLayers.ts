import maplibregl from "maplibre-gl";
export const TYPE_MATCH_EXPR: maplibregl.ExpressionSpecification = ["coalesce", ["get", "type"], ["get", "entity_type_id"], ""];
export { ensurePointGeotypeIcons } from "./shared/pointStyle";

import { getDefenseLineLayers } from "./geotypes/defense_line";
import { getMilitaryRouteLayers } from "./geotypes/military_route";
import { getRetreatRouteLayers } from "./geotypes/retreat_route";
import { getMigrationRouteLayers } from "./geotypes/migration_route";
import { getTradeRouteLayers } from "./geotypes/trade_route";
import { getCountryLayers } from "./geotypes/country";
import { getStateLayers } from "./geotypes/state";
import { getFactionLayers } from "./geotypes/faction";
import { getBattleLayers } from "./geotypes/battle";
import { getRebellionZoneLayers } from "./geotypes/rebellion_zone";
import { getPersonEventLayers } from "./geotypes/person_event";
import { getTempleLayers } from "./geotypes/temple";
import { getCapitalLayers } from "./geotypes/capital";
import { getCityLayers } from "./geotypes/city";
import { getFortificationLayers } from "./geotypes/fortification";
import { getRuinLayers } from "./geotypes/ruin";
import { getPortLayers } from "./geotypes/port";
import { getLineLabelLayers } from "./shared/lineLabels";
import { getPolygonLabelLayers } from "./shared/polygonLabels";

import { LayerSpecification } from "maplibre-gl";

export function getAllGeotypeLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        ...getCountryLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getStateLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getFactionLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getBattleLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRebellionZoneLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getDefenseLineLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getMilitaryRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRetreatRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getMigrationRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getTradeRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getPersonEventLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getTempleLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getCapitalLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getCityLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getFortificationLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRuinLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getPortLayers(sourceId, pathArrowSourceId, pointSourceId)
    ];
}

export function getAllGeotypeLabelLayers(polygonLabelSourceId: string, lineSourceId: string): LayerSpecification[] {
    return [
        ...getPolygonLabelLayers(polygonLabelSourceId),
        ...getLineLabelLayers(lineSourceId),
    ];
}
