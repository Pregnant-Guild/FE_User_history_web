import maplibregl from "maplibre-gl";
import type { ModeGetter } from "@/uhm/lib/map/engines/engineTypes";

export type SelectFeatureClickPayload = {
    featureId: string | number;
    point: { x: number; y: number };
    lngLat: { lng: number; lat: number };
};

// Khởi tạo engine chọn feature và context menu edit/delete.
export function initSelect(
    map: maplibregl.Map,
    getMode: ModeGetter,
    onDelete?: (id: string | number | (string | number)[]) => void,
    onEdit?: (feature: maplibregl.MapGeoJSONFeature) => void,
    onDuplicate?: (id: string | number) => void,
    onHide?: (id: string | number) => void,
    onSelectIds?: (ids: (string | number)[]) => void,
    onReplayEdit?: (id: string | number) => void,
    isEditSessionActive?: () => boolean,
    onBindGeometries?: (targetId: string | number, sourceIds: (string | number)[]) => void,
    onFeatureClick?: (payload: SelectFeatureClickPayload | null) => void,
    onAddToProject?: (feature: maplibregl.MapGeoJSONFeature) => void,
    isLocalFeature?: (id: string | number) => boolean,
    allowFeatureSelection?: () => boolean,
    allowGeometryEditing?: () => boolean
) {

    const FEATURE_STATE_SOURCES = [
        "countries",
        "places",
        "path-arrow-shapes",
    ] as const;
    const selectedIds = new Set<number | string>();
    const hasContextActions = Boolean(onDelete || onEdit || onDuplicate || onHide || onReplayEdit || onBindGeometries || onAddToProject);
    let contextMenu: HTMLDivElement | null = null;
    let docClickHandler: ((ev: MouseEvent) => void) | null = null;
    let cursorTimer: number | null = null;
    let pendingCursorPoint: { x: number; y: number } | null = null;

    // Bỏ highlight feature-state của toàn bộ đối tượng đang chọn.
    function clearSelection(emit = true) {
        if (!selectedIds.size) return;
        selectedIds.forEach((id) => setSelectionStateForId(id, false));
        selectedIds.clear();
        if (emit) {
            onSelectIds?.([]);
        }
    }

    // Chọn hoặc toggle đối tượng; giữ Alt để chọn cộng dồn/tắt chọn.
    function selectFeature(feature: maplibregl.MapGeoJSONFeature, additive: boolean) {
        const id = feature.id ?? feature.properties?.id;
        if (id === undefined || id === null) return false;

        if (!additive) {
            clearSelection();
        }

        const idToRemove = Array.from(selectedIds).find(sid => String(sid) === String(id));
        const isAlreadySelected = idToRemove !== undefined;

        if (additive && isAlreadySelected) {
            // Alt + click on an already selected feature removes it from the selection
            setSelectionStateForId(idToRemove, false);
            selectedIds.delete(idToRemove);
            onSelectIds?.(Array.from(selectedIds));
            return false;
        }

        setSelectionStateForId(id, true);
        selectedIds.add(id);
        onSelectIds?.(Array.from(selectedIds));
        return true;
    }

    // Chọn feature theo click trái, hỗ trợ additive bằng Alt.
    function onClick(e: maplibregl.MapLayerMouseEvent) {
        const mode = getMode();
        if (mode !== "select" && mode !== "replay" && mode !== "preview" && mode !== "replay_preview") return;
        if (isEditSessionActive?.()) return;
        const selectableLayers = getSelectableLayers();
        if (!selectableLayers.length) return;

        const features = map.queryRenderedFeatures(e.point, {
            layers: selectableLayers,
        }) as maplibregl.MapGeoJSONFeature[];

        if (!features.length) {
            if (allowFeatureSelection && !allowFeatureSelection()) {
                onFeatureClick?.(null);
                return;
            }
            clearSelection();
            onFeatureClick?.(null);
            return;
        }

        const feature = pickPreferredFeature(features);
        const id = feature.id ?? feature.properties?.id;
        if (id === undefined || id === null) return;
        if (allowFeatureSelection && !allowFeatureSelection()) {
            onFeatureClick?.({
                featureId: id,
                point: { x: e.point.x, y: e.point.y },
                lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
            });
            return;
        }

        const additive = !!e.originalEvent?.altKey;
        const didSelect = selectFeature(feature, additive);
        if (!didSelect) {
            onFeatureClick?.(null);
            return;
        }

        onFeatureClick?.({
            featureId: id,
            point: { x: e.point.x, y: e.point.y },
            lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
        });
    }

    // Hiển thị menu ngữ cảnh (sửa/xóa) khi click chuột phải.
    // Mở menu thao tác khi click phải lên feature.
    function onRightClick(e: maplibregl.MapLayerMouseEvent) {
        const mode = getMode();
        if (mode !== "select" && mode !== "replay" && mode !== "preview" && mode !== "replay_preview") return;
        const selectableLayers = getSelectableLayers();
        if (!selectableLayers.length) return;

        e.preventDefault(); // block browser menu
        if (mode === "replay" || mode === "preview" || mode === "replay_preview") return;
        if (isEditSessionActive?.()) return;

        const features = map.queryRenderedFeatures(e.point, {
            layers: selectableLayers,
        }) as maplibregl.MapGeoJSONFeature[];

        if (!features.length) return;

        const feature = pickPreferredFeature(features);
        const id = feature.id ?? feature.properties?.id;
        if (id === undefined || id === null) return;

        const isRightClickedItemAlreadySelected = Array.from(selectedIds).some(sid => String(sid) === String(id));
        const hasSelection = selectedIds.size > 0;

        // If the right-clicked item is not selected, and there is no active selection,
        // make it the sole selection. If there is an active selection, do not clear it
        // so we can bind the active selection to this target geometry.
        if (!isRightClickedItemAlreadySelected && !hasSelection) {
            clearSelection();
            selectFeature(feature, false);
        }

        showContextMenu(
            e.originalEvent?.clientX ?? e.point.x,
            e.originalEvent?.clientY ?? e.point.y,
            feature,
            isRightClickedItemAlreadySelected,
            hasSelection
        );
    }

    // Đổi cursor pointer khi hover lên đối tượng có thể chọn.
    function updateCursorFromPendingPoint() {
        cursorTimer = null;
        const mode = getMode();
        if (mode !== "select" && mode !== "replay" && mode !== "preview" && mode !== "replay_preview") return;
        const selectableLayers = getSelectableLayers();
        if (!selectableLayers.length) {
            map.getCanvas().style.cursor = "";
            return;
        }
        if (!pendingCursorPoint) return;

        const features = map.queryRenderedFeatures([pendingCursorPoint.x, pendingCursorPoint.y], {
            layers: selectableLayers,
        });

        map.getCanvas().style.cursor = features.length ? "pointer" : "";
    }

    function onMove(e: maplibregl.MapLayerMouseEvent) {
        pendingCursorPoint = { x: e.point.x, y: e.point.y };
        if (cursorTimer !== null) return;
        cursorTimer = window.setTimeout(updateCursorFromPendingPoint, 40);
    }

    function getSelectableLayers(): string[] {
        const style = map.getStyle();
        if (!style || !style.layers) return [];
        return style.layers
            .filter((layer) =>
                "source" in layer &&
                typeof layer.source === "string" &&
                FEATURE_STATE_SOURCES.includes(layer.source as (typeof FEATURE_STATE_SOURCES)[number])
            )
            .map((layer) => layer.id);
    }

    function setSelectionStateForId(id: string | number, selected: boolean) {
        if (!map.isStyleLoaded()) return;
        for (const source of FEATURE_STATE_SOURCES) {
            if (!map.getSource(source)) continue;
            map.setFeatureState({ source, id }, { selected });
        }
    }

    function pickPreferredFeature(features: maplibregl.MapGeoJSONFeature[]) {
        return [...features].sort((a, b) => featureSelectPriority(b) - featureSelectPriority(a))[0];
    }

    function featureSelectPriority(feature: maplibregl.MapGeoJSONFeature) {
        const layerId = typeof feature.layer?.id === "string" ? feature.layer.id : "";
        const geometryType = feature.geometry?.type;
        const source = typeof feature.source === "string" ? feature.source : "";

        if (layerId.endsWith("-hit")) return 400;
        if (source === "path-arrow-shapes") return 300;
        if (geometryType === "LineString" || geometryType === "MultiLineString") return 200;
        if (geometryType === "Point" || geometryType === "MultiPoint") return 100;
        return 0;
    }

    // Đồng bộ selection state từ React.
    function syncSelection(ids: (string | number)[]) {
        const nextSet = new Set(ids);
        selectedIds.forEach((id) => {
            if (!nextSet.has(id)) {
                setSelectionStateForId(id, false);
            }
        });
        selectedIds.clear();
        ids.forEach((id) => {
            setSelectionStateForId(id, true);
            selectedIds.add(id);
        });
    }

    map.on("click", onClick);
    map.on("mousemove", onMove);
    if (hasContextActions) {
        map.on("contextmenu", onRightClick);
    }

    const cleanup = () => {
        try {
            map.off("click", onClick);
            map.off("mousemove", onMove);
            if (cursorTimer !== null) {
                window.clearTimeout(cursorTimer);
                cursorTimer = null;
            }
            if (hasContextActions) {
                map.off("contextmenu", onRightClick);
            }
            if (map.isStyleLoaded()) {
                clearSelection(false);
            }
            hideContextMenu();
        } catch {
            // ignore
        }
    };

    return {
        cleanup,
        clearSelection,
        syncSelection,
    };

    // Ẩn và dọn dẹp context menu hiện tại.
    function hideContextMenu() {
        if (contextMenu) {
            contextMenu.remove();
            contextMenu = null;
        }
        if (docClickHandler) {
            document.removeEventListener("click", docClickHandler);
            docClickHandler = null;
        }
    }

    // Render menu ngữ cảnh tối giản gần vị trí con trỏ.
    function showContextMenu(
        x: number,
        y: number,
        clickedFeature: maplibregl.MapGeoJSONFeature,
        isRightClickedItemAlreadySelected: boolean,
        hasSelection: boolean
    ) {
        hideContextMenu();

        const menu = document.createElement("div");
        menu.style.position = "fixed";
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.background = "#0f172a";
        menu.style.color = "white";
        menu.style.border = "1px solid #1f2937";
        menu.style.borderRadius = "6px";
        menu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
        menu.style.zIndex = "9999";
        menu.style.minWidth = "120px";
        menu.style.fontSize = "14px";
        menu.style.padding = "4px 0";

        // Tạo một item thao tác trong context menu.
        const createItem = (label: string, onClick: () => void) => {
            const item = document.createElement("div");
            item.textContent = label;
            item.style.padding = "8px 12px";
            item.style.cursor = "pointer";
            item.onmouseenter = () => (item.style.background = "#1f2937");
            item.onmouseleave = () => (item.style.background = "transparent");
            item.onclick = () => {
                onClick();
                hideContextMenu();
            };
            return item;
        };

        const targetId = clickedFeature.id ?? clickedFeature.properties?.id;
        const hasTargetId = targetId !== undefined && targetId !== null;
        const isLocalTarget = hasTargetId ? (isLocalFeature?.(targetId) ?? true) : false;
        const selectedLocalIds = Array.from(selectedIds).filter((id) => isLocalFeature?.(id) ?? true);
        const localActionIds = selectedLocalIds.length
            ? selectedLocalIds
            : isLocalTarget && hasTargetId
                ? [targetId]
                : [];
        const effectiveCount = localActionIds.length;
        const isClickOutsideSelection = !isRightClickedItemAlreadySelected && hasSelection;

        type MenuItem = {
            label: string;
            onClick: () => void;
            group: "add" | "edit" | "bind" | "replay" | "delete";
        };

        const items: MenuItem[] = [];

        if (onAddToProject && hasTargetId && !isLocalTarget) {
            items.push({
                group: "add",
                label: "Add",
                onClick: () => onAddToProject(clickedFeature),
            });
        }

        if (isClickOutsideSelection && onBindGeometries && isLocalTarget && hasTargetId) {
            const sourceIds = selectedLocalIds.filter((id) => String(id) !== String(targetId));
            if (sourceIds.length) {
                items.push({
                    group: "bind",
                    label: `Bind ${sourceIds.length} geo đang chọn vào geo này`,
                    onClick: () => {
                        onBindGeometries(targetId, sourceIds);
                    },
                });
            }
        }

        const canEditGeometry = allowGeometryEditing ? allowGeometryEditing() : true;

        if (isLocalTarget && !isClickOutsideSelection && canEditGeometry) {
            if (
                effectiveCount === 1 &&
                clickedFeature.source === "countries" &&
                clickedFeature.geometry?.type === "Polygon" &&
                onEdit
            ) {
                const single = clickedFeature;
                items.push({
                    group: "edit",
                    label: "Chỉnh sửa",
                    onClick: () => onEdit(single),
                });
            }

            if (effectiveCount === 1 && onDuplicate && hasTargetId) {
                items.push({
                    group: "edit",
                    label: "Duplicate",
                    onClick: () => onDuplicate(targetId),
                });
            }

            if (effectiveCount === 1 && onHide && hasTargetId) {
                items.push({
                    group: "edit",
                    label: "Hide",
                    onClick: () => onHide(targetId),
                });
            }
        }

        if (isLocalTarget && onReplayEdit) {
            const replayId = targetId;
            if (replayId !== undefined && replayId !== null) {
                const totalCount = isClickOutsideSelection ? selectedLocalIds.length + 1 : effectiveCount;
                items.push({
                    group: "replay",
                    label: totalCount > 1 ? `Vào replay (${totalCount} geo)` : "Vào replay",
                    onClick: () => onReplayEdit(replayId),
                });
            }
        }

        if (isLocalTarget && onDelete && effectiveCount > 0 && canEditGeometry) {
            items.push({
                group: "delete",
                label: effectiveCount > 1 ? `Xóa ${effectiveCount} mục` : "Xóa",
                onClick: () => {
                    if (localActionIds.length === 1) {
                        onDelete(localActionIds[0]);
                    } else {
                        onDelete(localActionIds);
                    }
                    clearSelection();
                },
            });
        }

        if (items.length === 0) return;

        let lastGroup: string | null = null;
        items.forEach((item) => {
            if (lastGroup !== null && lastGroup !== item.group) {
                const separator = document.createElement("div");
                separator.style.height = "1px";
                separator.style.background = "#374151";
                separator.style.margin = "4px 0";
                menu.appendChild(separator);
            }
            menu.appendChild(createItem(item.label, item.onClick));
            lastGroup = item.group;
        });

        document.body.appendChild(menu);
        contextMenu = menu;

        // Đóng menu khi click ra ngoài vùng menu.
        const onDocClick = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                hideContextMenu();
            }
        };
        docClickHandler = onDocClick;
        setTimeout(() => document.addEventListener("click", onDocClick), 0);
    }
}
