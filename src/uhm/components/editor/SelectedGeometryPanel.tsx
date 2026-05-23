"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Feature } from "@/uhm/lib/editor/state/useEditorState";
import {
    GEOMETRY_TYPE_OPTIONS,
    GeometryPreset,
    GeometryTypeGroupId,
    findGeometryTypeOption,
    groupGeometryTypeOptions,
} from "@/uhm/lib/map/geo/geometryTypeOptions";
import { normalizeGeoTypeKey } from "@/uhm/lib/map/geo/geoTypeMap";
import { useEditorStore } from "@/uhm/store/editorStore";

type Props = {
    selectedFeatures: Feature[];
    onApplyGeometryMetadata: () => Promise<{ ok: boolean; error?: string }>;
    changeCount: number;
    onReplayEdit?: (id: string | number) => void;
    onDeleteFeatures?: (ids: (string | number)[]) => void;
    onDeselectAll?: () => void;
};

export default function SelectedGeometryPanel({
    selectedFeatures,
    onApplyGeometryMetadata,
    changeCount,
    onReplayEdit,
    onDeleteFeatures,
    onDeselectAll,
}: Props) {
    const {
        geometryMetaForm,
        setGeometryMetaForm,
        isEntitySubmitting,
    } = useEditorStore(
        useShallow((state) => ({
            geometryMetaForm: state.geometryMetaForm,
            setGeometryMetaForm: state.setGeometryMetaForm,
            isEntitySubmitting: state.isEntitySubmitting,
        }))
    );
    const [collapsed, setCollapsed] = useState(false);
    const [geoApplyFeedback, setGeoApplyFeedback] = useState<
        | {
              kind: "ok" | "error";
              text: string;
              signature: string;
          }
        | null
    >(null);

    const geoMetaSignature = useMemo(() => {
        return [
            geometryMetaForm.type_key,
            geometryMetaForm.time_start,
            geometryMetaForm.time_end,
            geometryMetaForm.binding,
        ].join("|");
    }, [
        geometryMetaForm.binding,
        geometryMetaForm.time_end,
        geometryMetaForm.time_start,
        geometryMetaForm.type_key,
    ]);

    const handleApplyGeoMeta = async () => {
        setGeoApplyFeedback(null);
        const result = await onApplyGeometryMetadata();
        if (result.ok) {
            setGeoApplyFeedback({ kind: "ok", text: "đã apply thành công", signature: geoMetaSignature });
        } else if (result.error) {
            setGeoApplyFeedback({ kind: "error", text: result.error, signature: geoMetaSignature });
        }
    };

    const visibleGeoApplyFeedback =
        geoApplyFeedback && geoApplyFeedback.signature === geoMetaSignature ? geoApplyFeedback : null;

    const isBulkMode = selectedFeatures.length >= 2;
    const isMultiEditValid = useMemo(() => {
        if (selectedFeatures.length <= 1) return true;
        const firstShape = selectedFeatures[0].geometry.type;
        return selectedFeatures.every((f) => f.geometry.type === firstShape);
    }, [selectedFeatures]);

    if (!selectedFeatures || selectedFeatures.length === 0) return null;
    const representativeFeature = selectedFeatures[0];

    const groupedGeometryTypeOptions = groupGeometryTypeOptions(GEOMETRY_TYPE_OPTIONS);
    const featureGeometryPreset = resolveFeatureGeometryPreset(representativeFeature);
    const allowedGroupIds = getAllowedGroupIdsForPreset(featureGeometryPreset);
    const groupedGeoTypeOptions = groupedGeometryTypeOptions.filter((group) =>
        allowedGroupIds.includes(group.id)
    );
    const selectedTypeOption = findGeometryTypeOption(geometryMetaForm.type_key);
    const hasCurrentVisibleTypeOption = groupedGeoTypeOptions.some((group) =>
        group.options.some((option) => option.value === geometryMetaForm.type_key)
    );

    return (
        <div
            style={{
                padding: "10px",
                background: "#0b1220",
                borderRadius: "8px",
                border: "1px solid #1f2937",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: "8px" }}>
                <div style={{ fontWeight: 700, fontSize: "14px" }}>
                    {isBulkMode ? `Đang chọn ${selectedFeatures.length} Geometries` : "Geometry property"}
                </div>
                <button
                    type="button"
                    onClick={() => setCollapsed((v) => !v)}
                    title={collapsed ? "Mo panel" : "Thu gon panel"}
                    aria-label={collapsed ? "Mo panel Selected Geometry" : "Thu gon panel Selected Geometry"}
                    style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        border: "1px solid #334155",
                        background: "#0b1220",
                        color: "#e2e8f0",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "0 0 auto",
                    }}
                >
                    {collapsed ? <PlusIcon /> : <MinusIcon />}
                </button>
            </div>

            {collapsed ? null : (
                <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
                    {isBulkMode && (
                        <div
                            style={{
                                display: "grid",
                                gap: "8px",
                                border: "1px solid #334155",
                                borderRadius: "8px",
                                padding: "8px",
                                background: "#1e293b",
                            }}
                        >
                            <div style={{ color: "#93c5fd", fontWeight: 700, fontSize: "12px" }}>
                                HÀNH ĐỘNG NHANH
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                                <button
                                    type="button"
                                    onClick={() => onReplayEdit?.(representativeFeature.properties.id)}
                                    style={{
                                        border: "none",
                                        borderRadius: "6px",
                                        padding: "8px 10px",
                                        cursor: "pointer",
                                        background: "#2563eb",
                                        color: "#ffffff",
                                        fontWeight: 700,
                                        fontSize: "13px",
                                        textAlign: "center",
                                        gridColumn: "span 2",
                                    }}
                                >
                                    Vào Replay ({selectedFeatures.length} geo)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDeleteFeatures?.(selectedFeatures.map(f => f.properties.id))}
                                    style={{
                                        border: "none",
                                        borderRadius: "6px",
                                        padding: "7px 10px",
                                        cursor: "pointer",
                                        background: "#dc2626",
                                        color: "#ffffff",
                                        fontWeight: 600,
                                        fontSize: "12px",
                                        textAlign: "center",
                                    }}
                                >
                                    Xóa ({selectedFeatures.length} geo)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDeselectAll?.()}
                                    style={{
                                        border: "1px solid #475569",
                                        borderRadius: "6px",
                                        padding: "7px 10px",
                                        cursor: "pointer",
                                        background: "transparent",
                                        color: "#cbd5e1",
                                        fontWeight: 600,
                                        fontSize: "12px",
                                        textAlign: "center",
                                    }}
                                >
                                    Bỏ chọn tất cả
                                </button>
                            </div>
                        </div>
                    )}

                    <div
                        style={{
                            display: "grid",
                            gap: "8px",
                            border: "1px solid #243244",
                            borderRadius: "8px",
                            padding: "8px",
                            background: "#0f172a",
                        }}
                    >
                        <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "12px" }}>
                            Thuộc tính GEO
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>
                            Các giá trị này thuộc về GEO đang chọn, không phụ thuộc entity.
                        </div>

                        {!isMultiEditValid ? (
                            <div style={{ color: "#fca5a5", fontSize: "12px", padding: "8px", border: "1px solid #7f1d1d", borderRadius: "6px", background: "#450a0a", marginTop: "4px" }}>
                                Không thể chỉnh sửa thuộc tính cho các geometry không cùng loại hình dạng (Point, Line, Polygon).
                            </div>
                        ) : (
                            <>
                                <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "12px" }}>
                                    Loại GEO
                                </div>
                                <select
                                    value={geometryMetaForm.type_key}
                                    onChange={(event) =>
                                        setGeometryMetaForm((prev) => ({
                                            ...prev,
                                            type_key: event.target.value,
                                        }))
                                    }
                                    disabled={isEntitySubmitting}
                                    style={entityInputStyle}
                                >
                                    {!hasCurrentVisibleTypeOption && geometryMetaForm.type_key ? (
                                        <option value={geometryMetaForm.type_key}>
                                            Custom Type ({geometryMetaForm.type_key})
                                        </option>
                                    ) : null}
                                    {groupedGeoTypeOptions.map((group) => (
                                        <optgroup
                                            key={group.id}
                                            label={`${group.label} (${group.geometryLabel})`}
                                        >
                                            {group.options.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                {selectedTypeOption ? (
                                    <div style={{ color: "#cbd5e1", fontSize: "12px" }}>
                                        Đang chọn: <b>{selectedTypeOption.label}</b> ({selectedTypeOption.groupLabel})
                                    </div>
                                ) : geometryMetaForm.type_key ? (
                                    <div style={{ color: "#cbd5e1", fontSize: "12px" }}>
                                        Đang chọn: <b>{geometryMetaForm.type_key}</b>
                                    </div>
                                ) : null}
                                <input
                                    value={geometryMetaForm.time_start}
                                    onChange={(event) =>
                                        setGeometryMetaForm((prev) => ({
                                            ...prev,
                                            time_start: event.target.value,
                                        }))
                                    }
                                    placeholder="time_start"
                                    disabled={isEntitySubmitting}
                                    style={entityInputStyle}
                                />
                                <input
                                    value={geometryMetaForm.time_end}
                                    onChange={(event) =>
                                        setGeometryMetaForm((prev) => ({
                                            ...prev,
                                            time_end: event.target.value,
                                        }))
                                    }
                                    placeholder="time_end"
                                    disabled={isEntitySubmitting}
                                    style={entityInputStyle}
                                />
                                <button
                                    type="button"
                                    onClick={handleApplyGeoMeta}
                                    disabled={isEntitySubmitting}
                                    style={primaryGeometryButtonStyle}
                                >
                                    {isBulkMode ? `Apply cho ${selectedFeatures.length} geo` : "Apply"}
                                </button>
                                {onReplayEdit && !isBulkMode && selectedFeatures.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onReplayEdit(selectedFeatures[0].properties.id)}
                                        style={{
                                            ...primaryGeometryButtonStyle,
                                            background: "#1e293b",
                                            border: "1px solid #334155",
                                            color: "#38bdf8",
                                        }}
                                    >
                                        Replay Edit
                                    </button>
                                )}
                                {visibleGeoApplyFeedback ? (
                                    <div
                                        style={{
                                            fontSize: "12px",
                                            color:
                                                visibleGeoApplyFeedback.kind === "ok" ? "#22c55e" : "#fca5a5",
                                        }}
                                    >
                                        {visibleGeoApplyFeedback.text}
                                    </div>
                                ) : null}
                            </>
                        )}
                    </div>

                    {changeCount > 0 ? (
                        <div style={{ color: "#fca5a5", fontSize: "12px" }}>
                            Thay đổi sẽ vào lịch sử khi Commit.
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

const entityInputStyle: CSSProperties = {
    width: "100%",
    borderRadius: "6px",
    border: "1px solid #334155",
    background: "#111827",
    color: "#f8fafc",
    padding: "6px 8px",
    fontSize: "13px",
};

const primaryGeometryButtonStyle: CSSProperties = {
    border: "none",
    borderRadius: "6px",
    padding: "7px 8px",
    cursor: "pointer",
    background: "#0f766e",
    color: "#ffffff",
    fontWeight: 600,
};

function PlusIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function MinusIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function resolveFeatureGeometryPreset(feature: Feature): GeometryPreset {
    const explicitPreset = normalizeGeometryPreset(feature.properties.geometry_preset);
    if (explicitPreset) return explicitPreset;

    const semanticType = normalizeTypeId(feature.properties.type) || normalizeTypeId(feature.properties.entity_type_id);
    if (semanticType) {
        const option = findGeometryTypeOption(semanticType);
        if (option) return option.geometryPreset;
    }

    return mapGeometryTypeToPreset(feature.geometry.type);
}

function normalizeGeometryPreset(value: unknown): GeometryPreset | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    if (
        normalized === "point" ||
        normalized === "line" ||
        normalized === "polygon" ||
        normalized === "circle-area"
    ) {
        return normalized;
    }
    return null;
}

function normalizeTypeId(value: unknown): string | null {
    return normalizeGeoTypeKey(value);
}

function mapGeometryTypeToPreset(
    geometryType: Feature["geometry"]["type"]
): GeometryPreset {
    if (geometryType === "Point" || geometryType === "MultiPoint") {
        return "point";
    }
    if (geometryType === "LineString" || geometryType === "MultiLineString") {
        return "line";
    }
    return "polygon";
}

function getAllowedGroupIdsForPreset(
    geometryPreset: GeometryPreset
): GeometryTypeGroupId[] {
    if (geometryPreset === "point") {
        return ["point"];
    }

    if (geometryPreset === "line") {
        return ["line"];
    }

    if (geometryPreset === "circle-area") {
        return ["circle"];
    }

    return ["polygon"];
}
