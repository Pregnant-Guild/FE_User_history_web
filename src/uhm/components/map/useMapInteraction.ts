import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { initDrawing } from "@/uhm/lib/map/engines/drawingEngine";
import { initSelect } from "@/uhm/lib/map/engines/selectingEngine";
import { initPoint } from "@/uhm/lib/map/engines/pointEngine";
import { initLine } from "@/uhm/lib/map/engines/lineEngine";
import { initPath } from "@/uhm/lib/map/engines/pathEngine";
import { initCircle } from "@/uhm/lib/map/engines/circleEngine";
import { createEditingEngine } from "@/uhm/lib/map/engines/editingEngine";
import { FeatureCollection, Geometry } from "@/uhm/lib/editor/state/useEditorState";
import { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";
import { buildClientFeatureId, getSelectableLayers } from "./mapUtils";
import { MapHoverPayload } from "../Map";

type EngineBinding = {
    cleanup: () => void;
    cancel?: () => void;
    clearSelection?: (skipNotify?: boolean) => void;
    syncSelection?: (ids: (string | number)[]) => void;
};

type UseMapInteractionProps = {
    mapRef: React.MutableRefObject<maplibregl.Map | null>;
    mode: EditorMode;
    modeRef: React.MutableRefObject<EditorMode>;
    draftRef: React.MutableRefObject<FeatureCollection>;
    allowGeometryEditing: boolean;
    selectedFeatureIds: (string | number)[];
    onSelectFeatureIdsRef: React.MutableRefObject<(ids: (string | number)[]) => void>;
    onSetModeRef: React.MutableRefObject<((mode: EditorMode, featureId?: string | number) => void) | undefined>;
    onCreateRef: React.MutableRefObject<((feature: FeatureCollection["features"][number]) => void) | undefined>;
    onDeleteRef: React.MutableRefObject<((id: string | number) => void) | undefined>;
    onHideRef: React.MutableRefObject<((id: string | number) => void) | undefined>;
    onUpdateRef: React.MutableRefObject<((id: string | number, geometry: Geometry) => void) | undefined>;
    onHoverFeatureChangeRef: React.MutableRefObject<((payload: MapHoverPayload | null) => void) | undefined>;
    onBindGeometriesRef?: React.MutableRefObject<((targetId: string | number, sourceIds: (string | number)[]) => void) | undefined>;
};

export function useMapInteraction({
    mapRef,
    mode,
    modeRef,
    draftRef,
    allowGeometryEditing,
    selectedFeatureIds,
    onSelectFeatureIdsRef,
    onSetModeRef,
    onCreateRef,
    onDeleteRef,
    onHideRef,
    onUpdateRef,
    onHoverFeatureChangeRef,
    onBindGeometriesRef,
}: UseMapInteractionProps) {
    const editingEngineRef = useRef<ReturnType<typeof createEditingEngine> | null>(null);
    const engineBindingsRef = useRef<Partial<Record<EditorMode, EngineBinding>>>({});
    const previousModeRef = useRef<EditorMode>(mode);
    const mapCleanupFnsRef = useRef<Array<() => void>>([]);

    useEffect(() => {
        if (!editingEngineRef.current) {
            editingEngineRef.current = createEditingEngine({
                mapRef,
                onUpdate: (id, geometry) => onUpdateRef.current?.(id, geometry),
            });
        }
    }, [mapRef, onUpdateRef]);

    useEffect(() => {
        const allowsSelectionMode = mode === "select" || mode === "replay";
        if (!allowsSelectionMode || !selectedFeatureIds || selectedFeatureIds.length === 0) {
            editingEngineRef.current?.clearEditing();
            // Clear the internal selection state of the select engine to stay in sync with React state
            engineBindingsRef.current.select?.clearSelection?.(false);
        }
    }, [mode, selectedFeatureIds]);

    useEffect(() => {
        const selectEngine = engineBindingsRef.current.select;
        if (selectEngine?.syncSelection) {
            selectEngine.syncSelection(selectedFeatureIds);
        }
    }, [selectedFeatureIds]);

    useEffect(() => {
        const previousMode = previousModeRef.current;
        if (previousMode !== mode) {
            engineBindingsRef.current[previousMode]?.cancel?.();
            previousModeRef.current = mode;
        }

        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        if (mode !== "draw") {
            (map.getSource("draw-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
                type: "FeatureCollection",
                features: [],
            });
        }
        if (mode !== "add-line") {
            (map.getSource("draw-line-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
                type: "FeatureCollection",
                features: [],
            });
        }
        if (mode !== "add-path") {
            (map.getSource("draw-path-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
                type: "FeatureCollection",
                features: [],
            });
        }
        if (mode !== "add-circle") {
            (map.getSource("draw-circle-preview") as maplibregl.GeoJSONSource | undefined)?.setData({
                type: "FeatureCollection",
                features: [],
            });
        }
    }, [mode, mapRef]);

    const setupMapInteractions = (map: maplibregl.Map) => {
        const drawingEngine = initDrawing(
            map,
            () => modeRef.current,
            (geometry: Geometry) => {
                const id = buildClientFeatureId();
                onCreateRef.current?.({
                    type: "Feature",
                    properties: {
                        id,
                        type: "country",
                        geometry_preset: "polygon",
                        entity_id: null,
                        entity_ids: [],
                        entity_name: null,
                        entity_type_id: null,
                        binding: [],
                    },
                    geometry,
                });
            }
        );

        const selectEngine = initSelect(
            map,
            () => modeRef.current,
            allowGeometryEditing
                ? (id: string | number) => {
                    editingEngineRef.current?.clearEditing();
                    onSelectFeatureIdsRef.current?.([]);
                    onDeleteRef.current?.(id);
                }
                : undefined,
            allowGeometryEditing
                ? (feature) => {
                    const rawId = feature.id ?? feature.properties?.id;
                    const originalFeature = draftRef.current.features.find(
                        (item) => String(item.properties.id) === String(rawId)
                    );
                    editingEngineRef.current?.beginEditing(
                        (originalFeature || feature) as unknown as maplibregl.MapGeoJSONFeature
                    );
                }
                : undefined,
            allowGeometryEditing
                ? (id: string | number) => {
                    const originalFeature = draftRef.current.features.find(
                        (item) => String(item.properties.id) === String(id)
                    );
                    if (!originalFeature) return;

                    const nextFeature = buildDuplicatedFeatureShapeOnly(originalFeature);
                    onCreateRef.current?.(nextFeature);
                }
                : undefined,
            allowGeometryEditing
                ? (id: string | number) => {
                    onHideRef.current?.(id);
                    onSelectFeatureIdsRef.current?.([]);
                }
                : undefined,
            (ids) => onSelectFeatureIdsRef.current?.(ids),
            (id: string | number) => onSetModeRef.current?.("replay", id),
            () => Boolean(editingEngineRef.current?.editingRef.current),
            (targetId, sourceIds) => onBindGeometriesRef?.current?.(targetId, sourceIds)
        );

        const cleanupPoint = initPoint(
            map,
            () => modeRef.current,
            (geometry: Geometry) => {
                const id = buildClientFeatureId();
                onCreateRef.current?.({
                    type: "Feature",
                    properties: {
                        id,
                        type: "city",
                        geometry_preset: "point",
                        entity_id: null,
                        entity_ids: [],
                        entity_name: null,
                        entity_type_id: null,
                        binding: [],
                    },
                    geometry,
                });
            }
        );

        const lineEngine = initLine(
            map,
            () => modeRef.current,
            (geometry: Geometry) => {
                const id = buildClientFeatureId();
                onCreateRef.current?.({
                    type: "Feature",
                    properties: {
                        id,
                        type: "defense_line",
                        geometry_preset: "line",
                        entity_id: null,
                        entity_ids: [],
                        entity_name: null,
                        entity_type_id: null,
                        binding: [],
                    },
                    geometry,
                });
            }
        );

        const pathEngine = initPath(
            map,
            () => modeRef.current,
            (geometry: Geometry) => {
                const id = buildClientFeatureId();
                onCreateRef.current?.({
                    type: "Feature",
                    properties: {
                        id,
                        type: "attack_route",
                        geometry_preset: "line",
                        entity_id: null,
                        entity_ids: [],
                        entity_name: null,
                        entity_type_id: null,
                        binding: [],
                    },
                    geometry,
                });
            }
        );

        const circleEngine = initCircle(
            map,
            () => modeRef.current,
            (geometry: Geometry) => {
                const id = buildClientFeatureId();
                onCreateRef.current?.({
                    type: "Feature",
                    properties: {
                        id,
                        type: "war",
                        geometry_preset: "circle-area",
                        entity_id: null,
                        entity_ids: [],
                        entity_name: null,
                        entity_type_id: null,
                        binding: [],
                    },
                    geometry,
                });
            }
        );

        engineBindingsRef.current = {
            draw: drawingEngine,
            select: selectEngine,
            replay: selectEngine,
            "add-line": lineEngine,
            "add-path": pathEngine,
            "add-circle": circleEngine,
        };

        mapCleanupFnsRef.current.push(
            circleEngine.cleanup,
            pathEngine.cleanup,
            lineEngine.cleanup,
            cleanupPoint,
            selectEngine.cleanup,
            drawingEngine.cleanup
        );

        const handleHoverMove = (event: maplibregl.MapMouseEvent) => {
            const callback = onHoverFeatureChangeRef.current;
            if (!callback) return;

            const selectableLayers = getSelectableLayers(map);
            if (!selectableLayers.length) {
                callback(null);
                return;
            }

            const features = map.queryRenderedFeatures(event.point, {
                layers: selectableLayers,
            }) as maplibregl.MapGeoJSONFeature[];

            const feature = features[0];
            const rawFeatureId = feature?.id ?? feature?.properties?.id;
            if (rawFeatureId === undefined || rawFeatureId === null) {
                callback(null);
                return;
            }

            const currentFeature =
                draftRef.current.features.find(
                    (item) => String(item.properties.id) === String(rawFeatureId)
                ) || null;

            callback({
                featureId: rawFeatureId,
                feature: currentFeature,
                point: { x: event.point.x, y: event.point.y },
                lngLat: { lng: event.lngLat.lng, lat: event.lngLat.lat },
            });
        };

        const handleCanvasMouseLeave = () => {
            onHoverFeatureChangeRef.current?.(null);
        };

        map.on("mousemove", handleHoverMove);
        mapCleanupFnsRef.current.push(() => map.off("mousemove", handleHoverMove));

        map.getCanvasContainer().addEventListener("mouseleave", handleCanvasMouseLeave);
        mapCleanupFnsRef.current.push(() => {
            map.getCanvasContainer().removeEventListener("mouseleave", handleCanvasMouseLeave);
        });

        if (allowGeometryEditing) {
            editingEngineRef.current?.bindEditEvents(map);
        }
    };

    const cleanupMapInteractions = () => {
        for (const cleanupFn of mapCleanupFnsRef.current) {
            cleanupFn();
        }
        mapCleanupFnsRef.current = [];
        engineBindingsRef.current = {};
    };

    return {
        editingEngineRef,
        setupMapInteractions,
        cleanupMapInteractions,
    };
}

function buildDuplicatedFeatureShapeOnly(
    feature: FeatureCollection["features"][number]
): FeatureCollection["features"][number] {
    const geometry = cloneGeometry(feature.geometry);
    return {
        type: "Feature",
        properties: {
            id: buildClientFeatureId(),
            type: feature.properties.type ?? null,
            geometry_preset: feature.properties.geometry_preset ?? null,
            entity_id: null,
            entity_ids: [],
            entity_name: null,
            entity_names: [],
            binding: [],
        },
        geometry,
    };
}

function cloneGeometry(geometry: Geometry): Geometry {
    if (typeof structuredClone === "function") {
        return structuredClone(geometry);
    }
    return JSON.parse(JSON.stringify(geometry)) as Geometry;
}
