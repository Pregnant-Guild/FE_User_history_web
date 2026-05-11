export type GeometryTypeGroupId =
    | "line"
    | "polygon"
    | "circle"
    | "point";

export type GeometryPreset = "line" | "polygon" | "circle-area" | "point";

export type GeometryTypeGroup = {
    id: GeometryTypeGroupId;
    label: string;
    geometryLabel: string;
    description: string;
};

export type GeometryTypeOption = {
    value: string;
    label: string;
    groupId: GeometryTypeGroupId;
    groupLabel: string;
    geometryPreset: GeometryPreset;
};

export const GEOMETRY_TYPE_GROUPS: GeometryTypeGroup[] = [
    {
        id: "line",
        label: "line - Tuyến",
        geometryLabel: "Line",
        description: "Các tuyến line/path (gấp khúc).",
    },
    {
        id: "polygon",
        label: "polygon - Đa giác",
        geometryLabel: "Polygon",
        description: "Vùng lãnh thổ dạng đa giác.",
    },
    {
        id: "circle",
        label: "circle - Tròn",
        geometryLabel: "Circle",
        description: "Vùng sự kiện theo bán kính ảnh hưởng.",
    },
    {
        id: "point",
        label: "point - Điểm",
        geometryLabel: "Point",
        description: "Địa điểm đơn lẻ.",
    },
];

const GROUP_BY_ID: Record<GeometryTypeGroupId, GeometryTypeGroup> = {
    line: GEOMETRY_TYPE_GROUPS[0],
    polygon: GEOMETRY_TYPE_GROUPS[1],
    circle: GEOMETRY_TYPE_GROUPS[2],
    point: GEOMETRY_TYPE_GROUPS[3],
};

const RAW_GEOMETRY_TYPE_OPTIONS: Array<{
    value: string;
    label: string;
    groupId: GeometryTypeGroupId;
    geometryPreset: GeometryPreset;
}> = [
    { value: "defense_line", label: "Defense Line", groupId: "line", geometryPreset: "line" },

    { value: "attack_route", label: "Attack Route", groupId: "line", geometryPreset: "line" },
    { value: "retreat_route", label: "Retreat Route", groupId: "line", geometryPreset: "line" },
    { value: "invasion_route", label: "Invasion Route", groupId: "line", geometryPreset: "line" },
    { value: "migration_route", label: "Migration Route", groupId: "line", geometryPreset: "line" },
    { value: "refugee_route", label: "Refugee Route", groupId: "line", geometryPreset: "line" },
    { value: "trade_route", label: "Trade Route", groupId: "line", geometryPreset: "line" },
    { value: "shipping_route", label: "Shipping Route", groupId: "line", geometryPreset: "line" },

    { value: "country", label: "Country", groupId: "polygon", geometryPreset: "polygon" },
    { value: "state", label: "State", groupId: "polygon", geometryPreset: "polygon" },
    { value: "empire", label: "Empire", groupId: "polygon", geometryPreset: "polygon" },
    { value: "kingdom", label: "Kingdom", groupId: "polygon", geometryPreset: "polygon" },

    { value: "war", label: "War", groupId: "circle", geometryPreset: "circle-area" },
    { value: "battle", label: "Battle", groupId: "circle", geometryPreset: "circle-area" },
    { value: "civilization", label: "Civilization", groupId: "circle", geometryPreset: "circle-area" },
    { value: "rebellion_zone", label: "Rebellion Zone", groupId: "circle", geometryPreset: "circle-area" },

    { value: "person_deathplace", label: "Person Deathplace", groupId: "point", geometryPreset: "point" },
    { value: "person_birthplace", label: "Person Birthplace", groupId: "point", geometryPreset: "point" },
    { value: "person_activity", label: "Person Activity", groupId: "point", geometryPreset: "point" },
    { value: "temple", label: "Temple", groupId: "point", geometryPreset: "point" },
    { value: "capital", label: "Capital", groupId: "point", geometryPreset: "point" },
    { value: "city", label: "City", groupId: "point", geometryPreset: "point" },
    { value: "fortress", label: "Fortress", groupId: "point", geometryPreset: "point" },
    { value: "castle", label: "Castle", groupId: "point", geometryPreset: "point" },
    { value: "ruin", label: "Ruin", groupId: "point", geometryPreset: "point" },
    { value: "port", label: "Port", groupId: "point", geometryPreset: "point" },
    { value: "bridge", label: "Bridge", groupId: "point", geometryPreset: "point" },
];

export const GEOMETRY_TYPE_OPTIONS: GeometryTypeOption[] = RAW_GEOMETRY_TYPE_OPTIONS.map((item) => ({
    ...item,
    groupLabel: GROUP_BY_ID[item.groupId].label,
}));

export const DEFAULT_GEOMETRY_TYPE_ID = "country";

// Gom option theo group để render select phân nhóm.
export function groupGeometryTypeOptions(options: GeometryTypeOption[] = GEOMETRY_TYPE_OPTIONS): Array<{
    id: GeometryTypeGroupId;
    label: string;
    geometryLabel: string;
    description: string;
    options: GeometryTypeOption[];
}> {
    return GEOMETRY_TYPE_GROUPS.map((group) => ({
        ...group,
        options: options.filter((option) => option.groupId === group.id),
    })).filter((group) => group.options.length > 0);
}

// Tìm option theo type id, trả null nếu không tồn tại.
export function findGeometryTypeOption(typeId: string | null | undefined): GeometryTypeOption | null {
    if (!typeId) return null;
    return GEOMETRY_TYPE_OPTIONS.find((option) => option.value === typeId) || null;
}
