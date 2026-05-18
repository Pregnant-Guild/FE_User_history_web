import {
    buildGoongProxyUrl,
    GOONG_SATELLITE_STYLE_UPSTREAM_URL,
    GOONG_VECTOR_OVERLAY_STYLE_UPSTREAM_URL,
    USE_EXTERNAL_BACKGROUND_RASTER,
} from "@/uhm/api/config";
import { GOONG_LABEL_FALLBACK_FONT_STACK } from "@/uhm/lib/map/styles/shared/textFonts";
import maplibregl from "maplibre-gl";

export type GoongBackgroundGroupId =
    | "bg-country-borders-line"
    | "bg-province-borders-line"
    | "bg-district-borders-line"
    | "country-labels"
    | "rivers-line";

type GoongStyleSource = {
    type?: string;
    url?: string;
    tiles?: string[];
    tileSize?: number;
    attribution?: string;
    bounds?: number[];
    scheme?: "xyz" | "tms";
    minzoom?: number;
    maxzoom?: number;
};

type GoongSourceManifest = {
    tiles?: string[];
    tileSize?: number;
    pixel_scale?: number | string;
    attribution?: string;
    bounds?: number[];
    scheme?: "xyz" | "tms";
    minzoom?: number;
    maxzoom?: number;
};

type GoongStyleDocument = {
    glyphs?: string;
    sprite?: string;
    sources?: Record<string, GoongStyleSource>;
    layers?: maplibregl.LayerSpecification[];
};

let externalRasterSourcePromise: Promise<maplibregl.RasterSourceSpecification> | null = null;
let goongOverlayBundlePromise: Promise<GoongBackgroundOverlayBundle | null> | null = null;
const goongStyleDocumentPromises = new Map<string, Promise<GoongStyleDocument>>();
const goongSourceSpecificationPromises = new Map<string, Promise<maplibregl.SourceSpecification>>();

type GoongBackgroundOverlayBundle = {
    sources: Record<string, maplibregl.SourceSpecification>;
    layers: maplibregl.LayerSpecification[];
};

export async function getBackgroundRasterSourceSpecification(): Promise<maplibregl.RasterSourceSpecification> {
    if (!USE_EXTERNAL_BACKGROUND_RASTER) {
        throw new Error("NEXT_PUBLIC_API_URL_ROOT is not configured.");
    }

    if (!externalRasterSourcePromise) {
        externalRasterSourcePromise = loadGoongRasterSourceSpecification(
            GOONG_SATELLITE_STYLE_UPSTREAM_URL
        );
    }

    try {
        return await externalRasterSourcePromise;
    } catch (error) {
        externalRasterSourcePromise = null;
        throw error;
    }
}

export async function getGoongBackgroundOverlayBundle(): Promise<GoongBackgroundOverlayBundle | null> {
    if (!USE_EXTERNAL_BACKGROUND_RASTER) {
        throw new Error("NEXT_PUBLIC_API_URL_ROOT is not configured.");
    }

    if (!goongOverlayBundlePromise) {
        goongOverlayBundlePromise = loadGoongBackgroundOverlayBundle(
            GOONG_VECTOR_OVERLAY_STYLE_UPSTREAM_URL
        );
    }

    try {
        return await goongOverlayBundlePromise;
    } catch (error) {
        goongOverlayBundlePromise = null;
        throw error;
    }
}

async function loadGoongRasterSourceSpecification(
    styleUpstreamUrl: string
): Promise<maplibregl.RasterSourceSpecification> {
    const style = await loadGoongStyleDocument(styleUpstreamUrl);
    const sources = style.sources || {};

    for (const source of Object.values(sources)) {
        if (source.type !== "raster") continue;

        const spec = await normalizeGoongSourceSpecification(source, styleUpstreamUrl);
        if (spec.type === "raster" && (spec.tiles?.length || "url" in spec)) {
            return spec;
        }
    }

    throw new Error("No raster source found in Goong satellite style.");
}

async function loadGoongBackgroundOverlayBundle(
    styleUpstreamUrl: string
): Promise<GoongBackgroundOverlayBundle | null> {
    const style = await loadGoongStyleDocument(styleUpstreamUrl);
    const layers = style.layers || [];
    const sources = style.sources || {};
    const layerById = new Map(layers.map((layer) => [layer.id, layer]));
    const selectedLayersByGroup = new Map<GoongBackgroundGroupId, maplibregl.LayerSpecification[]>([
        ["bg-country-borders-line", []],
        ["bg-province-borders-line", []],
        ["bg-district-borders-line", []],
        ["rivers-line", []],
        ["country-labels", []],
    ]);

    for (const rawLayer of layers) {
        const resolvedLayer = resolveLayerReference(rawLayer, layerById);
        const groupId = detectGoongBackgroundGroup(resolvedLayer);
        if (!groupId) continue;
        selectedLayersByGroup.get(groupId)?.push(resolvedLayer);
    }

    const selectedSourceIds = new Set<string>();
    for (const groupLayers of selectedLayersByGroup.values()) {
        for (const layer of groupLayers) {
            if ("source" in layer && typeof layer.source === "string") {
                selectedSourceIds.add(layer.source);
            }
        }
    }

    if (selectedSourceIds.size === 0) {
        return null;
    }

    const sourceIdMap = new Map<string, string>();
    const overlaySources: Record<string, maplibregl.SourceSpecification> = {};
    const overlaySourceEntries = await Promise.all(
        [...selectedSourceIds].map(async (sourceId) => {
            const source = sources[sourceId];
            if (!source) {
                return null;
            }

            const prefixedId = `goong-overlay-${sourceId}`;
            const normalizedSource = await normalizeGoongSourceSpecification(
                source,
                styleUpstreamUrl
            );

            return { sourceId, prefixedId, normalizedSource };
        })
    );

    for (const entry of overlaySourceEntries) {
        if (!entry) continue;
        sourceIdMap.set(entry.sourceId, entry.prefixedId);
        overlaySources[entry.prefixedId] = entry.normalizedSource;
    }

    const overlayLayers: maplibregl.LayerSpecification[] = [];
    for (const groupId of [
        "rivers-line",
        "bg-country-borders-line",
        "bg-province-borders-line",
        "bg-district-borders-line",
        "country-labels",
    ] as const) {
        const groupLayers = [...(selectedLayersByGroup.get(groupId) || [])].sort(compareOverlayLayers);
        groupLayers.forEach((layer, index) => {
            overlayLayers.push(
                cloneOverlayLayer(layer, {
                    id: `goong-${groupId}-${index}`,
                    groupId,
                    sourceIdMap,
                })
            );
        });
    }

    return {
        sources: overlaySources,
        layers: overlayLayers,
    };
}

async function loadGoongStyleDocument(styleUpstreamUrl: string): Promise<GoongStyleDocument> {
    const existingPromise = goongStyleDocumentPromises.get(styleUpstreamUrl);
    if (existingPromise) {
        return existingPromise;
    }

    const styleProxyUrl = buildGoongProxyUrl(styleUpstreamUrl);
    const promise = fetch(styleProxyUrl, { cache: "force-cache" })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Goong style request failed with status ${response.status}`);
            }
            return (await response.json()) as GoongStyleDocument;
        });
    goongStyleDocumentPromises.set(styleUpstreamUrl, promise);

    try {
        return await promise;
    } catch (error) {
        goongStyleDocumentPromises.delete(styleUpstreamUrl);
        throw error;
    }
}

async function loadGoongSourceSpecification(
    sourceUpstreamUrl: string,
    parentSource: GoongStyleSource
): Promise<maplibregl.SourceSpecification> {
    const cacheKey = JSON.stringify({
        sourceUpstreamUrl,
        type: parentSource.type,
        tileSize: parentSource.tileSize,
        minzoom: parentSource.minzoom,
        maxzoom: parentSource.maxzoom,
    });
    const existingPromise = goongSourceSpecificationPromises.get(cacheKey);
    if (existingPromise) {
        return existingPromise;
    }

    const sourceProxyUrl = buildGoongProxyUrl(sourceUpstreamUrl);
    const promise = fetch(sourceProxyUrl, { cache: "force-cache" })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Goong source request failed with status ${response.status}`);
            }
            return (await response.json()) as GoongSourceManifest;
        })
        .then((sourceDocument) =>
            normalizeManifestBackedGoongSourceSpecification(parentSource, sourceDocument, sourceUpstreamUrl)
        );
    goongSourceSpecificationPromises.set(cacheKey, promise);

    try {
        return await promise;
    } catch (error) {
        goongSourceSpecificationPromises.delete(cacheKey);
        throw error;
    }
}

async function normalizeGoongSourceSpecification(
    source: GoongStyleSource,
    parentDocumentUrl: string
): Promise<maplibregl.SourceSpecification> {
    if (typeof source.url === "string" && source.url) {
        const sourceUpstreamUrl = resolveGoongResourceUrl(source.url, parentDocumentUrl);
        return loadGoongSourceSpecification(sourceUpstreamUrl, source);
    }

    return normalizeInlineGoongSourceSpecification(source, parentDocumentUrl);
}

function normalizeInlineGoongSourceSpecification(
    source: GoongStyleSource,
    parentDocumentUrl: string
): maplibregl.SourceSpecification {
    return buildMapLibreSourceSpecification(source, parentDocumentUrl);
}

function normalizeManifestBackedGoongSourceSpecification(
    parentSource: GoongStyleSource,
    sourceManifest: GoongSourceManifest,
    sourceUpstreamUrl: string
): maplibregl.SourceSpecification {
    const mergedSource: GoongStyleSource = {
        ...parentSource,
        attribution: sourceManifest.attribution ?? parentSource.attribution,
        bounds: sourceManifest.bounds ?? parentSource.bounds,
        maxzoom: sourceManifest.maxzoom ?? parentSource.maxzoom,
        minzoom: sourceManifest.minzoom ?? parentSource.minzoom,
        scheme: sourceManifest.scheme ?? parentSource.scheme,
        tileSize:
            sourceManifest.tileSize ??
            normalizeGoongTileSize(sourceManifest.pixel_scale) ??
            parentSource.tileSize,
        tiles: sourceManifest.tiles ?? parentSource.tiles,
    };

    return buildMapLibreSourceSpecification(mergedSource, sourceUpstreamUrl);
}

function buildMapLibreSourceSpecification(
    source: GoongStyleSource,
    parentDocumentUrl: string
): maplibregl.SourceSpecification {
    const resolvedTiles = Array.isArray(source.tiles)
        ? source.tiles.map((tileUrl) => {
            const upstreamTileUrl = resolveGoongResourceUrl(tileUrl, parentDocumentUrl);
            return buildGoongProxyUrl(upstreamTileUrl);
        })
        : undefined;

    if (source.type === "raster") {
        const rasterSource: maplibregl.RasterSourceSpecification = {
            type: "raster",
            ...(resolvedTiles?.length ? { tiles: resolvedTiles } : {}),
            ...(typeof source.tileSize === "number" ? { tileSize: source.tileSize } : {}),
            ...(typeof source.minzoom === "number" ? { minzoom: source.minzoom } : {}),
            ...(typeof source.maxzoom === "number" ? { maxzoom: source.maxzoom } : {}),
            ...(Array.isArray(source.bounds) ? { bounds: source.bounds as [number, number, number, number] } : {}),
            ...(source.scheme ? { scheme: source.scheme } : {}),
            ...(source.attribution ? { attribution: source.attribution } : {}),
        };

        return rasterSource;
    }

    if (source.type === "vector") {
        const vectorSource: maplibregl.VectorSourceSpecification = {
            type: "vector",
            ...(resolvedTiles?.length ? { tiles: resolvedTiles } : {}),
            ...(typeof source.minzoom === "number" ? { minzoom: source.minzoom } : {}),
            ...(typeof source.maxzoom === "number" ? { maxzoom: source.maxzoom } : {}),
            ...(Array.isArray(source.bounds) ? { bounds: source.bounds as [number, number, number, number] } : {}),
            ...(source.scheme ? { scheme: source.scheme } : {}),
            ...(source.attribution ? { attribution: source.attribution } : {}),
        };

        return vectorSource;
    }

    throw new Error(`Unsupported Goong source type: ${String(source.type || "unknown")}`);
}

function normalizeGoongTileSize(value: number | string | undefined): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string") {
        const parsedValue = Number.parseInt(value, 10);
        if (Number.isFinite(parsedValue)) {
            return parsedValue;
        }
    }

    return undefined;
}

function resolveLayerReference(
    layer: maplibregl.LayerSpecification,
    layerById: Map<string, maplibregl.LayerSpecification>
): maplibregl.LayerSpecification {
    const withRef = layer as maplibregl.LayerSpecification & { ref?: string };
    if (!withRef.ref) {
        return deepClone(layer);
    }

    const parent = layerById.get(withRef.ref);
    if (!parent) {
        return deepClone(layer);
    }

    const resolvedParent = resolveLayerReference(parent, layerById);
    const merged = {
        ...resolvedParent,
        ...deepClone(layer),
    } as maplibregl.LayerSpecification & {
        ref?: string;
        layout?: Record<string, unknown>;
        paint?: Record<string, unknown>;
        metadata?: Record<string, unknown>;
    };

    merged.layout = {
        ...(resolvedParent as { layout?: Record<string, unknown> }).layout,
        ...(withRef as { layout?: Record<string, unknown> }).layout,
    };
    merged.paint = {
        ...(resolvedParent as { paint?: Record<string, unknown> }).paint,
        ...(withRef as { paint?: Record<string, unknown> }).paint,
    };
    merged.metadata = {
        ...(resolvedParent as { metadata?: Record<string, unknown> }).metadata,
        ...(withRef as { metadata?: Record<string, unknown> }).metadata,
    };
    delete merged.ref;
    return merged;
}

function detectGoongBackgroundGroup(
    layer: maplibregl.LayerSpecification
): GoongBackgroundGroupId | null {
    const haystack = [
        layer.id,
        "source" in layer && typeof layer.source === "string" ? layer.source : "",
        "source-layer" in layer && typeof layer["source-layer"] === "string" ? layer["source-layer"] : "",
    ]
        .join(" ")
        .toLowerCase();

    if (layer.type === "symbol" && hasTextField(layer) && isPreferredPlaceLabelLayer(haystack)) {
        return "country-labels";
    }

    if (layer.type === "line") {
        const boundaryGroup = detectBoundaryGroup(layer, haystack);
        if (boundaryGroup) {
            return boundaryGroup;
        }
    }

    if (layer.type === "line" && /(water|waterway|river|stream|canal)/.test(haystack)) {
        return "rivers-line";
    }

    if (layer.type === "fill" && /(water|lake|reservoir|sea|ocean)/.test(haystack)) {
        return "rivers-line";
    }

    return null;
}

function hasTextField(layer: maplibregl.LayerSpecification): boolean {
    const layout = (layer as { layout?: Record<string, unknown> }).layout;
    return Boolean(layout && "text-field" in layout && layout["text-field"]);
}

function isPreferredPlaceLabelLayer(haystack: string): boolean {
    if (/(poi|airport|station|transit|rail|metro|bus|road|street|highway|path|route)/.test(haystack)) {
        return false;
    }

    return /(country|state|province|district|admin|place|city|town|village|settlement|capital|label)/.test(haystack);
}

function detectBoundaryGroup(
    _layer: maplibregl.LayerSpecification,
    haystack: string
): GoongBackgroundGroupId | null {
    if (/(road|street|highway|path|route|rail|transit|water|waterway|river|stream|canal)/.test(haystack)) {
        return null;
    }

    if (!/(boundary|border|admin|country|state|province|district|ward|commune|county)/.test(haystack)) {
        return null;
    }

    // Goong's public styles expose the boundary hierarchy most clearly
    // through boundary-land-type-{0,1,2}. Prefer these exact matches over
    // keyword heuristics because the heuristic buckets were mixing levels.
    if (/boundary-land-type-0/.test(haystack)) {
        if (/boundary-land-type-0-bg/.test(haystack)) {
            return null;
        }
        return "bg-country-borders-line";
    }

    if (/boundary-land-type-1/.test(haystack)) {
        if (/boundary-land-type-1-bg/.test(haystack)) {
            return null;
        }
        return "bg-province-borders-line";
    }

    if (/boundary-land-type-2/.test(haystack)) {
        return "bg-district-borders-line";
    }

    const adminLevels = extractAdminLevels(haystack);
    if (adminLevels.length > 0) {
        const minAdminLevel = Math.min(...adminLevels);
        if (minAdminLevel <= 2) return "bg-country-borders-line";
        if (minAdminLevel <= 5) return "bg-province-borders-line";
        return "bg-district-borders-line";
    }

    if (/(district|ward|commune|subdistrict|neighbou?rhood)/.test(haystack)) {
        return "bg-district-borders-line";
    }

    if (/(province|state|region)/.test(haystack)) {
        return "bg-province-borders-line";
    }

    if (/(country|national|international)/.test(haystack)) {
        return "bg-country-borders-line";
    }

    return null;
}

function extractAdminLevels(haystack: string): number[] {
    const matches = Array.from(
        haystack.matchAll(/(?:admin[_ -]?level|adminlevel|admin|level)[_ -]?(\d{1,2})/g)
    );

    return matches
        .map((match) => Number.parseInt(match[1] || "", 10))
        .filter((value) => Number.isFinite(value));
}

function cloneOverlayLayer(
    layer: maplibregl.LayerSpecification,
    options: {
        id: string;
        groupId: GoongBackgroundGroupId;
        sourceIdMap: Map<string, string>;
    }
): maplibregl.LayerSpecification {
    const cloned = deepClone(layer) as maplibregl.LayerSpecification & {
        source?: string;
        layout?: Record<string, unknown>;
        metadata?: Record<string, unknown>;
    };

    cloned.id = options.id;
    if (typeof cloned.source === "string" && options.sourceIdMap.has(cloned.source)) {
        cloned.source = options.sourceIdMap.get(cloned.source);
    }

    cloned.metadata = {
        ...(cloned.metadata || {}),
        uhmBackgroundGroupId: options.groupId,
        uhmBackgroundProvider: "goong",
    };

    if (options.groupId === "country-labels") {
        const layout = { ...(cloned.layout || {}) };
        delete layout["icon-image"];
        delete layout["icon-size"];
        delete layout["icon-allow-overlap"];
        delete layout["icon-ignore-placement"];
        if (!Array.isArray(layout["text-font"])) {
            layout["text-font"] = [...GOONG_LABEL_FALLBACK_FONT_STACK];
        }
        cloned.layout = layout;
    }

    return cloned;
}

function compareOverlayLayers(
    left: maplibregl.LayerSpecification,
    right: maplibregl.LayerSpecification
): number {
    const leftMinzoom = "minzoom" in left && typeof left.minzoom === "number"
        ? left.minzoom
        : -1;
    const rightMinzoom = "minzoom" in right && typeof right.minzoom === "number"
        ? right.minzoom
        : -1;

    if (leftMinzoom !== rightMinzoom) {
        return leftMinzoom - rightMinzoom;
    }

    return left.id.localeCompare(right.id);
}

function resolveGoongResourceUrl(value: string, parentDocumentUrl: string): string {
    if (/^[a-z]+:\/\//i.test(value) || value.startsWith("data:")) {
        return value;
    }

    try {
        return new URL(value, parentDocumentUrl).toString();
    } catch {
        return value;
    }
}

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
