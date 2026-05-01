import maplibregl from "maplibre-gl";
import type { ModeGetter } from "@/uhm/lib/engine/engineTypes";

// Khởi tạo engine chọn feature và context menu edit/delete.
export function initSelect(
    map: maplibregl.Map,
    getMode: ModeGetter,
    onDelete?: (id: string | number) => void,
    onEdit?: (feature: maplibregl.MapGeoJSONFeature) => void,
    onSelectId?: (id: string | number | null) => void
) {
    const SELECTABLE_LAYERS = [
        "countries-fill",
        "countries-line",
        "routes-line",
        "routes-path-arrow-fill",
        "routes-path-arrow-line",
        "routes-path-hit",
        "places-circle",
        "places-symbol",
    ] as const;
    const FEATURE_STATE_SOURCES = [
        "countries",
        "places",
        "path-arrow-shapes",
    ] as const;
    const selectedIds = new Set<number | string>();
    const hasContextActions = Boolean(onDelete || onEdit);
    let contextMenu: HTMLDivElement | null = null;
    let docClickHandler: ((ev: MouseEvent) => void) | null = null;

    // Bỏ highlight feature-state của toàn bộ đối tượng đang chọn.
    function clearSelection(emit = true) {
        if (!selectedIds.size) return;
        selectedIds.forEach((id) => setSelectionStateForId(id, false));
        selectedIds.clear();
        if (emit) {
            onSelectId?.(null);
        }
    }

    // Chọn hoặc toggle đối tượng; giữ Alt để chọn cộng dồn/tắt chọn.
    function selectFeature(feature: maplibregl.MapGeoJSONFeature, additive: boolean) {
        const id = feature.id ?? feature.properties?.id;
        if (id === undefined || id === null) return;

        if (!additive) {
            clearSelection();
        }

        if (additive && selectedIds.has(id)) {
            // Alt + click on an already selected feature removes it from the selection
            setSelectionStateForId(id, false);
            selectedIds.delete(id);
            onSelectId?.(selectedIds.size === 1 ? Array.from(selectedIds)[0] : null);
            return;
        }

        setSelectionStateForId(id, true);
        selectedIds.add(id);
        onSelectId?.(selectedIds.size === 1 ? id : null);
    }

    // Chọn feature theo click trái, hỗ trợ additive bằng Alt.
    function onClick(e: maplibregl.MapLayerMouseEvent) {
        if (getMode() !== "select") return;
        const selectableLayers = getSelectableLayers();
        if (!selectableLayers.length) return;

        const features = map.queryRenderedFeatures(e.point, {
            layers: selectableLayers,
        }) as maplibregl.MapGeoJSONFeature[];

        if (!features.length) {
            clearSelection();
            return;
        }

        const additive = !!e.originalEvent?.altKey;
        selectFeature(features[0], additive);
    }

    // Hiển thị menu ngữ cảnh (sửa/xóa) khi click chuột phải.
    // Mở menu thao tác khi click phải lên feature.
    function onRightClick(e: maplibregl.MapLayerMouseEvent) {
        if (getMode() !== "select") return;
        const selectableLayers = getSelectableLayers();
        if (!selectableLayers.length) return;

        e.preventDefault(); // block browser menu

        const features = map.queryRenderedFeatures(e.point, {
            layers: selectableLayers,
        }) as maplibregl.MapGeoJSONFeature[];

        if (!features.length) return;

        const feature = features[0];
        const id = feature.id ?? feature.properties?.id;
        if (id === undefined || id === null) return;

        // if right-clicked item not selected, make it the sole selection
        if (!selectedIds.has(id)) {
            clearSelection();
            selectFeature(feature, false);
        }

        showContextMenu(
            e.originalEvent?.clientX ?? e.point.x,
            e.originalEvent?.clientY ?? e.point.y,
            feature
        );
    }

    // Đổi cursor pointer khi hover lên đối tượng có thể chọn.
    function onMove(e: maplibregl.MapLayerMouseEvent) {
        if (getMode() !== "select") return;
        const selectableLayers = getSelectableLayers();
        if (!selectableLayers.length) {
            map.getCanvas().style.cursor = "";
            return;
        }

        const features = map.queryRenderedFeatures(e.point, {
            layers: selectableLayers,
        });

        map.getCanvas().style.cursor = features.length ? "pointer" : "";
    }

    function getSelectableLayers(): string[] {
        return SELECTABLE_LAYERS.filter((layerId) => Boolean(map.getLayer(layerId)));
    }

    function setSelectionStateForId(id: string | number, selected: boolean) {
        for (const source of FEATURE_STATE_SOURCES) {
            if (!map.getSource(source)) continue;
            map.setFeatureState({ source, id }, { selected });
        }
    }

    map.on("click", onClick);
    map.on("mousemove", onMove);
    if (hasContextActions) {
        map.on("contextmenu", onRightClick);
    }

    const cleanup = () => {
        map.off("click", onClick);
        map.off("mousemove", onMove);
        if (hasContextActions) {
            map.off("contextmenu", onRightClick);
        }
        clearSelection(false);
        hideContextMenu();
    };

    return {
        cleanup,
        clearSelection,
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
        clickedFeature: maplibregl.MapGeoJSONFeature
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

        const selectedCount = selectedIds.size || 1;
        let hasMenuItems = false;

        if (
            selectedCount === 1 &&
            clickedFeature.source === "countries" &&
            clickedFeature.geometry?.type === "Polygon" &&
            onEdit
        ) {
            const single = clickedFeature;
            menu.appendChild(createItem("Chỉnh sửa", () => onEdit(single)));
            hasMenuItems = true;
        }

        if (onDelete) {
            menu.appendChild(
                createItem(
                    selectedCount > 1 ? `Xóa ${selectedCount} mục` : "Xóa",
                    () => {
                        const ids = selectedIds.size
                            ? Array.from(selectedIds)
                            : [clickedFeature.id ?? clickedFeature.properties?.id];
                        ids.forEach((eachId) => {
                            if (eachId !== undefined && eachId !== null) onDelete(eachId);
                        });
                        clearSelection();
                    }
                )
            );
            hasMenuItems = true;
        }

        if (!hasMenuItems) return;

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
