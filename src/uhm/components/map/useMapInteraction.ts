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
import { buildClientFeatureId } from "./mapUtils";
import type { MapFeaturePayload } from "../Map";

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
    // Rendered/interacted FeatureCollection from Map.tsx. This may already be filtered by
    // replay/timeline state, so do not treat it as the canonical commit/edit draft.
    renderDraftRef: React.MutableRefObject<FeatureCollection>;
    allowGeometryEditing: boolean;
    selectedFeatureIds: (string | number)[];
    onSelectFeatureIdsRef: React.MutableRefObject<(ids: (string | number)[]) => void>;
    onSetModeRef: React.MutableRefObject<((mode: EditorMode, featureId?: string | number) => void) | undefined>;
    onCreateRef: React.MutableRefObject<((feature: FeatureCollection["features"][number]) => void) | undefined>;
    onDeleteRef: React.MutableRefObject<((id: string | number | (string | number)[]) => void) | undefined>;
    onHideRef: React.MutableRefObject<((id: string | number) => void) | undefined>;
    onUpdateRef: React.MutableRefObject<((id: string | number, geometry: Geometry) => void) | undefined>;
    onFeatureClickRef: React.MutableRefObject<((payload: MapFeaturePayload | null) => void) | undefined>;
    onBindGeometriesRef?: React.MutableRefObject<((targetId: string | number, sourceIds: (string | number)[]) => void) | undefined>;
    localFeatureIdsRef?: React.MutableRefObject<(string | number)[] | undefined>;
    onAddFeatureToProjectRef?: React.MutableRefObject<((feature: FeatureCollection["features"][number]) => void) | undefined>;
    allowFeatureSelection?: boolean;
};

export function useMapInteraction({
    mapRef,
    mode,
    modeRef,
    renderDraftRef,
    allowGeometryEditing,
    selectedFeatureIds,
    onSelectFeatureIdsRef,
    onSetModeRef,
    onCreateRef,
    onDeleteRef,
    onHideRef,
    onUpdateRef,
    onFeatureClickRef,
    onBindGeometriesRef,
    localFeatureIdsRef,
    onAddFeatureToProjectRef,
    allowFeatureSelection = true,
}: UseMapInteractionProps) {
    const editingEngineRef = useRef<ReturnType<typeof createEditingEngine> | null>(null);
    const engineBindingsRef = useRef<Partial<Record<EditorMode, EngineBinding>>>({});
    const previousModeRef = useRef<EditorMode>(mode);
    const mapCleanupFnsRef = useRef<Array<() => void>>([]);

    const allowGeometryEditingRef = useRef(allowGeometryEditing);
    const allowFeatureSelectionRef = useRef(allowFeatureSelection);

    useEffect(() => {
        allowGeometryEditingRef.current = allowGeometryEditing;
    }, [allowGeometryEditing]);

    useEffect(() => {
        allowFeatureSelectionRef.current = allowFeatureSelection;
    }, [allowFeatureSelection]);

    useEffect(() => {
        if (!editingEngineRef.current) {
            editingEngineRef.current = createEditingEngine({
                mapRef,
                onUpdate: (id, geometry) => onUpdateRef.current?.(id, geometry),
            });
        }
    }, [mapRef, onUpdateRef]);

    useEffect(() => {
        const allowsSelectionMode = mode === "select" || mode === "replay" || mode === "preview" || mode === "replay_preview";
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
        (map as MapWithRenderDraftRef)._renderDraftRef = renderDraftRef;
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
                        bound_with: null,
                    },
                    geometry,
                });
            }
        );

        const selectEngine = initSelect(
            map,
            () => modeRef.current,
            (id: string | number | (string | number)[]) => {
                editingEngineRef.current?.clearEditing();
                onSelectFeatureIdsRef.current?.([]);
                onDeleteRef.current?.(id);
            },
            (feature) => {
                const rawId = feature.properties?.id ?? feature.id;
                const originalFeature = renderDraftRef.current.features.find(
                    (item) => String(item.properties.id) === String(rawId)
                );
                editingEngineRef.current?.beginEditing(
                    (originalFeature || feature) as unknown as maplibregl.MapGeoJSONFeature
                );
            },
            (id: string | number) => {
                const originalFeature = renderDraftRef.current.features.find(
                    (item) => String(item.properties.id) === String(id)
                );
                if (!originalFeature) return;

                const nextFeature = buildDuplicatedFeatureShapeOnly(originalFeature);
                onCreateRef.current?.(nextFeature);
            },
            (id: string | number) => {
                onHideRef.current?.(id);
                onSelectFeatureIdsRef.current?.([]);
            },
            (ids) => onSelectFeatureIdsRef.current?.(ids),
            (id: string | number) => onSetModeRef.current?.("replay", id),
            () => Boolean(editingEngineRef.current?.editingRef.current),
            (targetId, sourceIds) => onBindGeometriesRef?.current?.(targetId, sourceIds),
            (payload) => {
                if (!payload) {
                    onFeatureClickRef.current?.(null);
                    return;
                }

                const currentFeature =
                    renderDraftRef.current.features.find(
                        (item) => String(item.properties.id) === String(payload.featureId)
                    ) || null;

                onFeatureClickRef.current?.({
                    ...payload,
                    feature: currentFeature,
                });
            },
            (feature) => {
                if (!onAddFeatureToProjectRef?.current) return;
                const rawId = feature.properties?.id ?? feature.id;
                if (rawId === undefined || rawId === null) return;

                const originalFeature = renderDraftRef.current.features.find(
                    (item) => String(item.properties.id) === String(rawId)
                );
                if (!originalFeature) return;
                onAddFeatureToProjectRef.current?.(originalFeature);
            },
            (id) => {
                if (!onAddFeatureToProjectRef?.current) return true;
                const localIds = localFeatureIdsRef?.current;
                if (!Array.isArray(localIds)) return true;
                return localIds.some((localId) => String(localId) === String(id));
            },
            () => allowFeatureSelectionRef.current,
            () => allowGeometryEditingRef.current
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
                        bound_with: null,
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
                        bound_with: null,
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
                        type: "military_route",
                        geometry_preset: "line",
                        entity_id: null,
                        entity_ids: [],
                        entity_name: null,
                        entity_type_id: null,
                        bound_with: null,
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
                        type: "battle",
                        geometry_preset: "circle-area",
                        entity_id: null,
                        entity_ids: [],
                        entity_name: null,
                        entity_type_id: null,
                        bound_with: null,
                    },
                    geometry,
                });
            }
        );

        engineBindingsRef.current = {
            draw: drawingEngine,
            select: selectEngine,
            preview: selectEngine,
            replay: selectEngine,
            replay_preview: selectEngine,
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

        const editCleanup = editingEngineRef.current?.bindEditEvents(map);
        if (editCleanup) {
            mapCleanupFnsRef.current.push(editCleanup);
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

type MapWithRenderDraftRef = maplibregl.Map & {
    _renderDraftRef?: React.MutableRefObject<FeatureCollection>;
};

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
            bound_with: null,
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
