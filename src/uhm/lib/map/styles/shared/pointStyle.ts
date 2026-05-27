import maplibregl, { LayerSpecification } from "maplibre-gl";
import { MAP_EMPHASIS_TEXT_FONT_STACK } from "./textFonts";

export const POINT_GEOTYPE_IDS = [
    "person_event",
    "temple",
    "capital",
    "city",
    "fortification",
    "ruin",
    "port",
] as const;

export type PointGeotypeId = (typeof POINT_GEOTYPE_IDS)[number];

export const POINT_GEOTYPE_ICON_PATHS: Partial<Record<PointGeotypeId, string>> = {
    person_event: "/images/mapIcon/point/flag.png",
    temple: "/images/mapIcon/point/temple.png",
    capital: "/images/mapIcon/point/capital.png",
    city: "/images/mapIcon/point/city.png",
    fortification: "/images/mapIcon/point/castle.png",
    ruin: "/images/mapIcon/point/ruin.png",
    port: "/images/mapIcon/point/port.png",
};


type PointLayerOptions = {
    iconScale?: number;
    haloRadius?: number;
};

type PointStyleConfig = {
    fill: string;
    rim: string;
    iconScale: number;
    haloRadius: number;
    drawGlyph: (ctx: CanvasRenderingContext2D) => void;
};

const TYPE_MATCH_EXPR: maplibregl.ExpressionSpecification = ["coalesce", ["get", "type"], ["get", "entity_type_id"], ""];
const SELECTED_EXPR: maplibregl.ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];

const ICON_CANVAS_SIZE = 48;
const POINT_GEOMETRY_FILTER: maplibregl.ExpressionSpecification = [
    "any",
    ["==", ["geometry-type"], "Point"],
    ["==", ["geometry-type"], "MultiPoint"],
];

const POINT_STYLE_CONFIG: Record<PointGeotypeId, PointStyleConfig> = {
    person_event: {
        fill: "#f97316",
        rim: "#9a3412",
        iconScale: 0.98,
        haloRadius: 14,
        drawGlyph: drawFlagGlyph,
    },
    temple: {
        fill: "#d97706",
        rim: "#78350f",
        iconScale: 1.02,
        haloRadius: 15,
        drawGlyph: drawTempleGlyph,
    },
    capital: {
        fill: "#eab308",
        rim: "#854d0e",
        iconScale: 1.08,
        haloRadius: 17,
        drawGlyph: drawCrownGlyph,
    },
    city: {
        fill: "#2563eb",
        rim: "#1e3a8a",
        iconScale: 1.02,
        haloRadius: 15,
        drawGlyph: drawCityGlyph,
    },
    fortification: {
        fill: "#7c3aed",
        rim: "#4c1d95",
        iconScale: 1.04,
        haloRadius: 16,
        drawGlyph: drawCastleGlyph,
    },
    ruin: {
        fill: "#78716c",
        rim: "#44403c",
        iconScale: 0.98,
        haloRadius: 14,
        drawGlyph: drawRuinGlyph,
    },
    port: {
        fill: "#0284c7",
        rim: "#075985",
        iconScale: 1.02,
        haloRadius: 15,
        drawGlyph: drawAnchorGlyph,
    },
};

export function buildPointGeotypeLayers(
    typeId: PointGeotypeId,
    pointSourceId: string,
    options: PointLayerOptions = {}
): LayerSpecification[] {
    const config = POINT_STYLE_CONFIG[typeId];
    const haloRadius = (options.haloRadius ?? config.haloRadius) * 2;
    const iconScale = options.iconScale ?? config.iconScale;

    return [
        {
            id: `${typeId}-selected-halo`,
            type: "circle",
            source: pointSourceId,
            filter: pointFilter(typeId),
            paint: {
                "circle-color": config.fill,
                "circle-radius": ["case", SELECTED_EXPR, haloRadius, 0],
                "circle-opacity": ["case", SELECTED_EXPR, 0.24, 0],
                "circle-blur": ["case", SELECTED_EXPR, 0.8, 0],
                "circle-stroke-color": config.rim,
                "circle-stroke-width": ["case", SELECTED_EXPR, 1.6, 0],
                "circle-stroke-opacity": ["case", SELECTED_EXPR, 0.48, 0],
            },
        },
        {
            id: `${typeId}-circle`,
            type: "symbol",
            source: pointSourceId,
            filter: pointFilter(typeId),
            layout: {
                "icon-image": getPointIconId(typeId),
                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    1, 0.96 * iconScale,
                    4, 1.24 * iconScale,
                    6, 1.52 * iconScale,
                ],
                "icon-anchor": "center",
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "symbol-placement": "point",
                "text-font": [...MAP_EMPHASIS_TEXT_FONT_STACK],
                "text-field": ["coalesce", ["get", "point_label"], ""],
                "text-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    1, 11,
                    4, 13,
                    6, 15,
                ],
                "text-anchor": "bottom",
                "text-offset": [0, -1.25],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
                "text-optional": true,
                "text-max-width": 12,
            },
            paint: {
                "icon-opacity": 0.98,
                "text-color": "#f8fafc",
                "text-halo-color": "#0f172a",
                "text-halo-width": 1.4,
                "text-halo-blur": 0.3,
            },
        },
    ];
}

const preloadedImages: Record<string, HTMLImageElement> = {};
const loadedImageKeys = new Set<string>();
const mapsToUpdate = new Set<maplibregl.Map>();

export function unregisterMapFromIconUpdates(map: maplibregl.Map) {
    mapsToUpdate.delete(map);
}

function preloadPointIcons() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    for (const [typeId, path] of Object.entries(POINT_GEOTYPE_ICON_PATHS)) {
        if (!preloadedImages[typeId]) {
            const img = new Image();
            img.src = path;
            img.onload = () => {
                loadedImageKeys.add(typeId);
                for (const map of mapsToUpdate) {
                    updateIconsOnMap(map, typeId as PointGeotypeId);
                }
            };
            preloadedImages[typeId] = img;
        }
    }
}

function updateIconsOnMap(map: maplibregl.Map, typeId: PointGeotypeId) {
    if (!map || !map.getStyle()) return;
    try {
        const iconId = getPointIconId(typeId);
        const imageData = createPointIconImageData(typeId);
        if (imageData) {
            if (map.hasImage(iconId)) {
                map.updateImage(iconId, imageData);
            } else {
                map.addImage(iconId, imageData, { pixelRatio: 2 });
            }
        }
    } catch (err) {
        console.warn(`Failed to update icon ${typeId} on map:`, err);
    }
}

export function ensurePointGeotypeIcons(map: maplibregl.Map): boolean {
    if (typeof document === "undefined") return false;

    preloadPointIcons();

    const missingAny = Object.keys(POINT_GEOTYPE_ICON_PATHS).some(
        (key) => !loadedImageKeys.has(key)
    );
    if (missingAny) {
        mapsToUpdate.add(map);
    }

    for (const typeId of POINT_GEOTYPE_IDS) {
        const iconId = getPointIconId(typeId);
        if (map.hasImage(iconId)) continue;
        const imageData = createPointIconImageData(typeId);
        if (!imageData) return false;
        map.addImage(iconId, imageData, { pixelRatio: 2 });
    }

    return true;
}

function pointFilter(typeId: PointGeotypeId): maplibregl.ExpressionSpecification {
    return ["all", POINT_GEOMETRY_FILTER, ["==", TYPE_MATCH_EXPR, typeId]];
}

function getPointIconId(typeId: PointGeotypeId): string {
    return `point-${typeId}`;
}

function createPointIconImageData(typeId: PointGeotypeId): ImageData | null {
    const config = POINT_STYLE_CONFIG[typeId];
    const palette = { fill: config.fill, rim: config.rim };

    const canvas = document.createElement("canvas");
    canvas.width = ICON_CANVAS_SIZE;
    canvas.height = ICON_CANVAS_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
    drawGlyphWithOutline(ctx, palette.fill, palette.rim, () => config.drawGlyph(ctx));

    return ctx.getImageData(0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
}

function drawGlyphWithOutline(
    ctx: CanvasRenderingContext2D,
    fill: string,
    rim: string,
    draw: () => void
) {
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = rim;
    ctx.fillStyle = rim;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    draw();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = fill;
    ctx.fillStyle = fill;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    draw();
    ctx.restore();
}

function drawFlagGlyph(ctx: CanvasRenderingContext2D) {
    const img = preloadedImages["person_event"];
    if (img && loadedImageKeys.has("person_event")) {
        ctx.drawImage(img, 0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
    } else {
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(26, 22);
        ctx.lineTo(26, 43);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(28, 23);
        ctx.lineTo(40, 27);
        ctx.lineTo(28, 31);
        ctx.closePath();
        ctx.fill();

        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(22.5, 44.5);
        ctx.lineTo(31, 44.5);
        ctx.stroke();
    }
}

function drawTempleGlyph(ctx: CanvasRenderingContext2D) {
    const img = preloadedImages["temple"];
    if (img && loadedImageKeys.has("temple")) {
        ctx.drawImage(img, 0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
    } else {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(22, 30);
        ctx.lineTo(32, 22);
        ctx.lineTo(42, 30);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(21, 31);
        ctx.lineTo(43, 31);
        ctx.moveTo(23, 42);
        ctx.lineTo(41, 42);
        ctx.stroke();

        ctx.lineWidth = 2.8;
        for (const x of [26, 32, 38]) {
            ctx.beginPath();
            ctx.moveTo(x, 31);
            ctx.lineTo(x, 42);
            ctx.stroke();
        }
    }
}

function drawCrownGlyph(ctx: CanvasRenderingContext2D) {
    const img = preloadedImages["capital"];
    if (img && loadedImageKeys.has("capital")) {
        ctx.drawImage(img, 0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
    } else {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(22, 41);
        ctx.lineTo(24.5, 28);
        ctx.lineTo(30, 34);
        ctx.lineTo(32, 23);
        ctx.lineTo(34, 34);
        ctx.lineTo(39.5, 28);
        ctx.lineTo(42, 41);
        ctx.closePath();
        ctx.stroke();

        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(23.5, 41.5);
        ctx.lineTo(40.5, 41.5);
        ctx.stroke();
    }
}

function drawCityGlyph(ctx: CanvasRenderingContext2D) {
    const img = preloadedImages["city"];
    if (img && loadedImageKeys.has("city")) {
        ctx.drawImage(img, 0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
    } else {
        ctx.fillRect(23, 33, 7, 10);
        ctx.fillRect(30, 27, 6, 16);
        ctx.fillRect(36, 30, 6, 13);

        ctx.clearRect(25, 36, 1.5, 1.5);
        ctx.clearRect(25, 39, 1.5, 1.5);
        ctx.clearRect(32, 31, 1.5, 1.5);
        ctx.clearRect(32, 35, 1.5, 1.5);
        ctx.clearRect(38, 33, 1.5, 1.5);
        ctx.clearRect(38, 37, 1.5, 1.5);
    }
}

function drawCastleGlyph(ctx: CanvasRenderingContext2D) {
    const img = preloadedImages["fortification"];
    if (img && loadedImageKeys.has("fortification")) {
        ctx.drawImage(img, 0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
    } else {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(24, 31, 16, 11);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(24, 31);
        ctx.lineTo(24, 26);
        ctx.lineTo(28, 26);
        ctx.lineTo(28, 29);
        ctx.lineTo(32, 29);
        ctx.lineTo(32, 24);
        ctx.lineTo(36, 24);
        ctx.lineTo(36, 29);
        ctx.lineTo(40, 29);
        ctx.lineTo(40, 26);
        ctx.lineTo(44, 26);
        ctx.lineTo(44, 31);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(32, 42);
        ctx.lineTo(32, 34);
        ctx.stroke();
    }
}

function drawRuinGlyph(ctx: CanvasRenderingContext2D) {
    const img = preloadedImages["ruin"];
    if (img && loadedImageKeys.has("ruin")) {
        ctx.drawImage(img, 0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
    } else {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(26, 24, 12, 18);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(24, 24);
        ctx.lineTo(40, 24);
        ctx.moveTo(24, 42);
        ctx.lineTo(40, 42);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(34, 24);
        ctx.lineTo(31, 29);
        ctx.lineTo(35, 33);
        ctx.lineTo(30, 39);
        ctx.stroke();
    }
}

function drawAnchorGlyph(ctx: CanvasRenderingContext2D) {
    const img = preloadedImages["port"];
    if (img && loadedImageKeys.has("port")) {
        ctx.drawImage(img, 0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
    } else {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(32, 22.5, 3.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(32, 26.5);
        ctx.lineTo(32, 41);
        ctx.moveTo(24, 31.5);
        ctx.lineTo(40, 31.5);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(32, 35.5, 9, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(24.5, 38);
        ctx.lineTo(21.5, 34);
        ctx.moveTo(39.5, 38);
        ctx.lineTo(42.5, 34);
        ctx.stroke();
    }
}


