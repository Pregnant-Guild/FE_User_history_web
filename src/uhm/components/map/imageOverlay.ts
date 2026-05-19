import maplibregl from "maplibre-gl";

export type MapImageOverlay = {
    url: string;
    name: string;
    opacity: number;
    aspectRatio: number;
    coordinates: maplibregl.Coordinates;
};

const IMAGE_OVERLAY_SOURCE_ID = "uhm-image-overlay-source";
const IMAGE_OVERLAY_LAYER_ID = "uhm-image-overlay-layer";
const IMAGE_OVERLAY_CONTROL_SOURCE_ID = "uhm-image-overlay-control-source";
const IMAGE_OVERLAY_HANDLE_LAYER_ID = "uhm-image-overlay-handles";
const IMAGE_OVERLAY_CENTER_LAYER_ID = "uhm-image-overlay-center";

type OverlayControlAction = "move" | "resize";
type OverlayResizeEdge = "top" | "right" | "bottom" | "left";

type OverlayControlFeature = GeoJSON.Feature<GeoJSON.Point, {
    action: OverlayControlAction;
    edge?: OverlayResizeEdge;
}>;

export function applyImageOverlay(
    map: maplibregl.Map,
    overlay: MapImageOverlay | null | undefined
) {
    if (!overlay) {
        removeImageOverlay(map);
        return;
    }

    const existingSource = map.getSource(IMAGE_OVERLAY_SOURCE_ID) as maplibregl.ImageSource | undefined;
    if (existingSource) {
        if (existingSource.url === overlay.url) {
            existingSource.setCoordinates(overlay.coordinates);
        } else {
            existingSource.updateImage({
                url: overlay.url,
                coordinates: overlay.coordinates,
            });
        }
    } else {
        map.addSource(IMAGE_OVERLAY_SOURCE_ID, {
            type: "image",
            url: overlay.url,
            coordinates: overlay.coordinates,
        });
    }

    if (!map.getLayer(IMAGE_OVERLAY_LAYER_ID)) {
        map.addLayer({
            id: IMAGE_OVERLAY_LAYER_ID,
            type: "raster",
            source: IMAGE_OVERLAY_SOURCE_ID,
            paint: {
                "raster-opacity": clampOpacity(overlay.opacity),
                "raster-fade-duration": 0,
                "raster-resampling": "linear",
            },
        });
    } else {
        map.setPaintProperty(IMAGE_OVERLAY_LAYER_ID, "raster-opacity", clampOpacity(overlay.opacity));
        map.setPaintProperty(IMAGE_OVERLAY_LAYER_ID, "raster-fade-duration", 0);
    }

    // Không truyền beforeId để layer được đưa lên trên cùng, phục vụ trace khi vẽ.
    map.moveLayer(IMAGE_OVERLAY_LAYER_ID);
    applyImageOverlayControls(map, overlay);
}

export function removeImageOverlay(map: maplibregl.Map) {
    removeImageOverlayControls(map);

    if (map.getLayer(IMAGE_OVERLAY_LAYER_ID)) {
        map.removeLayer(IMAGE_OVERLAY_LAYER_ID);
    }

    if (map.getSource(IMAGE_OVERLAY_SOURCE_ID)) {
        map.removeSource(IMAGE_OVERLAY_SOURCE_ID);
    }
}

export function getViewportImageCoordinates(
    map: maplibregl.Map,
    aspectRatio: number
): maplibregl.Coordinates {
    const canvas = map.getCanvas();
    const canvasWidth = Math.max(canvas.clientWidth || canvas.width || 800, 1);
    const canvasHeight = Math.max(canvas.clientHeight || canvas.height || 600, 1);
    const safeAspectRatio = normalizeAspectRatio(aspectRatio);

    let width = canvasWidth * 0.72;
    let height = width / safeAspectRatio;
    const maxHeight = canvasHeight * 0.72;
    if (height > maxHeight) {
        height = maxHeight;
        width = height * safeAspectRatio;
    }

    return buildCoordinatesFromScreenBox(
        map,
        { x: canvasWidth / 2, y: canvasHeight / 2 },
        width,
        height
    );
}

export function moveImageOverlayCoordinatesByPixels(
    map: maplibregl.Map,
    coordinates: maplibregl.Coordinates,
    deltaX: number,
    deltaY: number
): maplibregl.Coordinates {
    return moveCoordinates(map, coordinates, new maplibregl.Point(deltaX, deltaY));
}

export function scaleImageOverlayCoordinatesByFactor(
    map: maplibregl.Map,
    coordinates: maplibregl.Coordinates,
    factor: number,
    aspectRatio: number
): maplibregl.Coordinates {
    const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
    const screenBox = getScreenBox(map, coordinates);
    const minimumSize = 48;
    const width = Math.max(screenBox.width * safeFactor, minimumSize);
    const height = width / normalizeAspectRatio(aspectRatio);
    return buildCoordinatesFromScreenBox(map, screenBox.center, width, height);
}

export function bindImageOverlayInteractions(
    map: maplibregl.Map,
    getOverlay: () => MapImageOverlay | null,
    onChange: (overlay: MapImageOverlay) => void
) {
    let rafId: number | null = null;
    let pendingCoordinates: maplibregl.Coordinates | null = null;
    let latestOverlay: MapImageOverlay | null = null;
    let activeDrag: {
        action: OverlayControlAction;
        edge: OverlayResizeEdge | null;
        startPoint: maplibregl.Point;
        startCoordinates: maplibregl.Coordinates;
        startBox: ScreenBox;
        aspectRatio: number;
        wasDragPanEnabled: boolean;
    } | null = null;

    const startDrag = (event: maplibregl.MapLayerMouseEvent) => {
        if ((event.originalEvent as MouseEvent | undefined)?.button !== 2) return;

        const overlay = getOverlay();
        const feature = event.features?.[0] as OverlayControlFeature | undefined;
        if (!overlay || !feature?.properties?.action) return;

        event.preventDefault();
        event.originalEvent.preventDefault();
        event.originalEvent.stopPropagation();

        activeDrag = {
            action: feature.properties.action,
            edge: feature.properties.edge || null,
            startPoint: event.point,
            startCoordinates: overlay.coordinates,
            startBox: getScreenBox(map, overlay.coordinates),
            aspectRatio: normalizeAspectRatio(overlay.aspectRatio),
            wasDragPanEnabled: map.dragPan.isEnabled(),
        };
        latestOverlay = overlay;
        map.dragPan.disable();
        map.getCanvas().style.cursor = activeDrag.action === "move" ? "grabbing" : "nwse-resize";
    };

    const moveDrag = (event: maplibregl.MapMouseEvent) => {
        if (!activeDrag) return;
        const overlay = getOverlay();
        if (!overlay) return;

        event.preventDefault();
        const nextCoordinates = activeDrag.action === "move"
            ? moveCoordinates(map, activeDrag.startCoordinates, event.point.sub(activeDrag.startPoint))
            : resizeCoordinates(map, activeDrag.startBox, event.point, activeDrag.edge, activeDrag.aspectRatio);

        latestOverlay = {
            ...overlay,
            coordinates: nextCoordinates,
        };
        scheduleImageOverlayCoordinateUpdate(map, nextCoordinates);
    };

    const endDrag = () => {
        if (!activeDrag) return;
        const finishedDrag = activeDrag;
        activeDrag = null;
        flushImageOverlayCoordinateUpdate(map);
        if (latestOverlay) {
            onChange(latestOverlay);
            latestOverlay = null;
        }
        if (finishedDrag.wasDragPanEnabled && !map.dragPan.isEnabled()) {
            map.dragPan.enable();
        }
        map.getCanvas().style.cursor = "";
    };

    const preventContextMenu = (event: maplibregl.MapLayerMouseEvent) => {
        event.preventDefault();
        event.originalEvent.preventDefault();
        event.originalEvent.stopPropagation();
    };

    map.on("mousedown", IMAGE_OVERLAY_HANDLE_LAYER_ID, startDrag);
    map.on("mousedown", IMAGE_OVERLAY_CENTER_LAYER_ID, startDrag);
    map.on("mousemove", moveDrag);
    map.on("mouseup", endDrag);
    map.on("contextmenu", IMAGE_OVERLAY_HANDLE_LAYER_ID, preventContextMenu);
    map.on("contextmenu", IMAGE_OVERLAY_CENTER_LAYER_ID, preventContextMenu);

    return () => {
        endDrag();
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        pendingCoordinates = null;
        map.off("mousedown", IMAGE_OVERLAY_HANDLE_LAYER_ID, startDrag);
        map.off("mousedown", IMAGE_OVERLAY_CENTER_LAYER_ID, startDrag);
        map.off("mousemove", moveDrag);
        map.off("mouseup", endDrag);
        map.off("contextmenu", IMAGE_OVERLAY_HANDLE_LAYER_ID, preventContextMenu);
        map.off("contextmenu", IMAGE_OVERLAY_CENTER_LAYER_ID, preventContextMenu);
    };

    function scheduleImageOverlayCoordinateUpdate(
        targetMap: maplibregl.Map,
        coordinates: maplibregl.Coordinates
    ) {
        pendingCoordinates = coordinates;
        if (rafId !== null) return;

        rafId = requestAnimationFrame(() => {
            rafId = null;
            flushImageOverlayCoordinateUpdate(targetMap);
        });
    }

    function flushImageOverlayCoordinateUpdate(targetMap: maplibregl.Map) {
        if (!pendingCoordinates) return;
        updateImageOverlayCoordinates(targetMap, pendingCoordinates);
        pendingCoordinates = null;
    }
}

export function getImageOverlayInteractiveLayerIds() {
    return [IMAGE_OVERLAY_HANDLE_LAYER_ID, IMAGE_OVERLAY_CENTER_LAYER_ID];
}

function applyImageOverlayControls(map: maplibregl.Map, overlay: MapImageOverlay) {
    const data = buildControlFeatureCollection(overlay.coordinates);
    const existingSource = map.getSource(IMAGE_OVERLAY_CONTROL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (existingSource) {
        existingSource.setData(data);
    } else {
        map.addSource(IMAGE_OVERLAY_CONTROL_SOURCE_ID, {
            type: "geojson",
            data,
        });
    }

    if (!map.getLayer(IMAGE_OVERLAY_HANDLE_LAYER_ID)) {
        map.addLayer({
            id: IMAGE_OVERLAY_HANDLE_LAYER_ID,
            type: "circle",
            source: IMAGE_OVERLAY_CONTROL_SOURCE_ID,
            filter: ["==", ["get", "action"], "resize"],
            paint: {
                "circle-color": "#38bdf8",
                "circle-radius": 7,
                "circle-stroke-color": "#0f172a",
                "circle-stroke-width": 2,
            },
        });
    }

    if (!map.getLayer(IMAGE_OVERLAY_CENTER_LAYER_ID)) {
        map.addLayer({
            id: IMAGE_OVERLAY_CENTER_LAYER_ID,
            type: "circle",
            source: IMAGE_OVERLAY_CONTROL_SOURCE_ID,
            filter: ["==", ["get", "action"], "move"],
            paint: {
                "circle-color": "#fbbf24",
                "circle-radius": 8,
                "circle-stroke-color": "#0f172a",
                "circle-stroke-width": 2,
            },
        });
    }

    map.moveLayer(IMAGE_OVERLAY_HANDLE_LAYER_ID);
    map.moveLayer(IMAGE_OVERLAY_CENTER_LAYER_ID);
}

function updateImageOverlayCoordinates(
    map: maplibregl.Map,
    coordinates: maplibregl.Coordinates
) {
    const imageSource = map.getSource(IMAGE_OVERLAY_SOURCE_ID) as maplibregl.ImageSource | undefined;
    imageSource?.setCoordinates(coordinates);

    const controlSource = map.getSource(IMAGE_OVERLAY_CONTROL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    controlSource?.setData(buildControlFeatureCollection(coordinates));
}

function removeImageOverlayControls(map: maplibregl.Map) {
    if (map.getLayer(IMAGE_OVERLAY_CENTER_LAYER_ID)) {
        map.removeLayer(IMAGE_OVERLAY_CENTER_LAYER_ID);
    }
    if (map.getLayer(IMAGE_OVERLAY_HANDLE_LAYER_ID)) {
        map.removeLayer(IMAGE_OVERLAY_HANDLE_LAYER_ID);
    }
    if (map.getSource(IMAGE_OVERLAY_CONTROL_SOURCE_ID)) {
        map.removeSource(IMAGE_OVERLAY_CONTROL_SOURCE_ID);
    }
}

function buildControlFeatureCollection(
    coordinates: maplibregl.Coordinates
): GeoJSON.FeatureCollection<GeoJSON.Point, OverlayControlFeature["properties"]> {
    const [topLeft, topRight, bottomRight, bottomLeft] = coordinates;
    const center = averageCoordinates(coordinates);

    return [
        createControlFeature(center, { action: "move" }),
        createControlFeature(midpoint(topLeft, topRight), { action: "resize", edge: "top" }),
        createControlFeature(midpoint(topRight, bottomRight), { action: "resize", edge: "right" }),
        createControlFeature(midpoint(bottomRight, bottomLeft), { action: "resize", edge: "bottom" }),
        createControlFeature(midpoint(bottomLeft, topLeft), { action: "resize", edge: "left" }),
    ].reduce<GeoJSON.FeatureCollection<GeoJSON.Point, OverlayControlFeature["properties"]>>(
        (collection, feature) => {
            collection.features.push(feature);
            return collection;
        },
        { type: "FeatureCollection", features: [] }
    );
}

function createControlFeature(
    coordinates: [number, number],
    properties: OverlayControlFeature["properties"]
): OverlayControlFeature {
    return {
        type: "Feature",
        properties,
        geometry: {
            type: "Point",
            coordinates,
        },
    };
}

type ScreenPoint = { x: number; y: number };
type ScreenBox = {
    center: ScreenPoint;
    width: number;
    height: number;
};

function getScreenBox(map: maplibregl.Map, coordinates: maplibregl.Coordinates): ScreenBox {
    const points = coordinates.map((coordinate) => map.project(coordinate));
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    return {
        center: {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
        },
        width: Math.max(maxX - minX, 40),
        height: Math.max(maxY - minY, 40),
    };
}

function moveCoordinates(
    map: maplibregl.Map,
    coordinates: maplibregl.Coordinates,
    delta: maplibregl.Point
): maplibregl.Coordinates {
    return coordinates.map((coordinate) => {
        const point = map.project(coordinate);
        return lngLatToCoordinate(map.unproject([point.x + delta.x, point.y + delta.y]));
    }) as maplibregl.Coordinates;
}

function resizeCoordinates(
    map: maplibregl.Map,
    startBox: ScreenBox,
    currentPoint: maplibregl.Point,
    edge: OverlayResizeEdge | null,
    aspectRatio: number
): maplibregl.Coordinates {
    const minimumSize = 48;
    let width = startBox.width;
    let height = startBox.height;

    if (edge === "left" || edge === "right") {
        width = Math.max(Math.abs(currentPoint.x - startBox.center.x) * 2, minimumSize);
        height = width / aspectRatio;
    } else {
        height = Math.max(Math.abs(currentPoint.y - startBox.center.y) * 2, minimumSize);
        width = height * aspectRatio;
    }

    return buildCoordinatesFromScreenBox(map, startBox.center, width, height);
}

function buildCoordinatesFromScreenBox(
    map: maplibregl.Map,
    center: ScreenPoint,
    width: number,
    height: number
): maplibregl.Coordinates {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return [
        lngLatToCoordinate(map.unproject([center.x - halfWidth, center.y - halfHeight])),
        lngLatToCoordinate(map.unproject([center.x + halfWidth, center.y - halfHeight])),
        lngLatToCoordinate(map.unproject([center.x + halfWidth, center.y + halfHeight])),
        lngLatToCoordinate(map.unproject([center.x - halfWidth, center.y + halfHeight])),
    ];
}

function averageCoordinates(coordinates: maplibregl.Coordinates): [number, number] {
    const total = coordinates.reduce(
        (sum, coordinate) => ({
            lng: sum.lng + coordinate[0],
            lat: sum.lat + coordinate[1],
        }),
        { lng: 0, lat: 0 }
    );
    return [total.lng / coordinates.length, total.lat / coordinates.length];
}

function midpoint(a: [number, number], b: [number, number]): [number, number] {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function lngLatToCoordinate(lngLat: maplibregl.LngLat): [number, number] {
    return [lngLat.lng, lngLat.lat];
}

function normalizeAspectRatio(value: number) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    return value;
}

function clampOpacity(value: number) {
    if (!Number.isFinite(value)) return 0.55;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}
