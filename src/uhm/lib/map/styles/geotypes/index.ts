import maplibregl from "maplibre-gl";
export const TYPE_MATCH_EXPR: maplibregl.ExpressionSpecification = ["coalesce", ["get", "type"], ["get", "entity_type_id"], ""];
export { ensurePointGeotypeIcons } from "./pointStyle";

import { getDefenseLineLayers } from "./defense_line";
import { getAttackRouteLayers } from "./attack_route";
import { getRetreatRouteLayers } from "./retreat_route";
import { getInvasionRouteLayers } from "./invasion_route";
import { getMigrationRouteLayers } from "./migration_route";
import { getRefugeeRouteLayers } from "./refugee_route";
import { getTradeRouteLayers } from "./trade_route";
import { getShippingRouteLayers } from "./shipping_route";
import { getCountryLayers } from "./country";
import { getStateLayers } from "./state";
import { getEmpireLayers } from "./empire";
import { getKingdomLayers } from "./kingdom";
import { getWarLayers } from "./war";
import { getBattleLayers } from "./battle";
import { getCivilizationLayers } from "./civilization";
import { getRebellionZoneLayers } from "./rebellion_zone";
import { getPersonDeathplaceLayers } from "./person_deathplace";
import { getPersonBirthplaceLayers } from "./person_birthplace";
import { getPersonActivityLayers } from "./person_activity";
import { getTempleLayers } from "./temple";
import { getCapitalLayers } from "./capital";
import { getCityLayers } from "./city";
import { getFortressLayers } from "./fortress";
import { getCastleLayers } from "./castle";
import { getRuinLayers } from "./ruin";
import { getPortLayers } from "./port";
import { getBridgeLayers } from "./bridge";

import { LayerSpecification } from "maplibre-gl";

export function getAllGeotypeLayers(sourceId: string, pathArrowSourceId?: string, pointSourceId?: string): LayerSpecification[] {
    return [
        ...getDefenseLineLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getAttackRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRetreatRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getInvasionRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getMigrationRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRefugeeRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getTradeRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getShippingRouteLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getCountryLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getStateLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getEmpireLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getKingdomLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getWarLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getBattleLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getCivilizationLayers(sourceId, pathArrowSourceId, pointSourceId),
        ...getRebellionZoneLayers(sourceId, pathArrowSourceId, pointSourceId),
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
