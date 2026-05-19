import maplibregl from "maplibre-gl";
export const TYPE_MATCH_EXPR: maplibregl.ExpressionSpecification = ["coalesce", ["get", "type"], ["get", "entity_type_id"], ""];
export { ensurePointGeotypeIcons } from "./shared/pointStyle";

import { getDefenseLineLayers } from "./geotypes/defense_line";
import { getAttackRouteLayers } from "./geotypes/attack_route";
import { getRetreatRouteLayers } from "./geotypes/retreat_route";
import { getInvasionRouteLayers } from "./geotypes/invasion_route";
import { getMigrationRouteLayers } from "./geotypes/migration_route";
import { getRefugeeRouteLayers } from "./geotypes/refugee_route";
import { getTradeRouteLayers } from "./geotypes/trade_route";
import { getShippingRouteLayers } from "./geotypes/shipping_route";
import { getCountryLayers } from "./geotypes/country";
import { getStateLayers } from "./geotypes/state";
import { getEmpireLayers } from "./geotypes/empire";
import { getKingdomLayers } from "./geotypes/kingdom";
import { getFactionLayers } from "./geotypes/faction";
import { getWarLayers } from "./geotypes/war";
import { getBattleLayers } from "./geotypes/battle";
import { getCivilizationLayers } from "./geotypes/civilization";
import { getRebellionZoneLayers } from "./geotypes/rebellion_zone";
import { getPersonDeathplaceLayers } from "./geotypes/person_deathplace";
import { getPersonBirthplaceLayers } from "./geotypes/person_birthplace";
import { getPersonActivityLayers } from "./geotypes/person_activity";
import { getTempleLayers } from "./geotypes/temple";
import { getCapitalLayers } from "./geotypes/capital";
import { getCityLayers } from "./geotypes/city";
import { getFortressLayers } from "./geotypes/fortress";
import { getCastleLayers } from "./geotypes/castle";
import { getRuinLayers } from "./geotypes/ruin";
import { getPortLayers } from "./geotypes/port";
import { getBridgeLayers } from "./geotypes/bridge";
import { getLineLabelLayers } from "./shared/lineLabels";
import { getPolygonLabelLayers } from "./shared/polygonLabels";

import { LayerSpecification } from "maplibre-gl";

export function getAllGeotypeLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        ...getCountryLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getStateLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getEmpireLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getKingdomLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getFactionLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getWarLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getBattleLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getCivilizationLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRebellionZoneLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getDefenseLineLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getAttackRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRetreatRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getInvasionRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getMigrationRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRefugeeRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getTradeRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getShippingRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getPersonDeathplaceLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getPersonBirthplaceLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getPersonActivityLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getTempleLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getCapitalLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getCityLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getFortressLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getCastleLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRuinLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getPortLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getBridgeLayers(sourceId, pathArrowSourceId, pointSourceId)
    ];
}

export function getAllGeotypeLabelLayers(polygonLabelSourceId: string, lineSourceId: string): LayerSpecification[] {
    return [
        ...getPolygonLabelLayers(polygonLabelSourceId),
        ...getLineLabelLayers(lineSourceId),
    ];
}
