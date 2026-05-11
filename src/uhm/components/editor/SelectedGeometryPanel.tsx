"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { Entity } from "@/uhm/api/entities";
import { Feature } from "@/uhm/lib/editor/state/useEditorState";
import {
    EntityGeometryPreset,
    EntityTypeGroupId,
    EntityTypeOption,
    findEntityTypeOption,
    groupEntityTypeOptions,
} from "@/uhm/lib/utils/entityTypeOptions";
import type { GeometryMetaFormState } from "@/uhm/lib/editor/session/sessionTypes";

type Props = {
    selectedFeatures: Feature[];
    selectedFeatureEntitySummary: string;
    selectedFeatureBindingSummary: string;
    entities: Entity[];
    selectedGeometryEntityIds: string[];
    onEntityIdsChange: (values: string[]) => void;
    entityTypeOptions: EntityTypeOption[];
    geometryMetaForm: GeometryMetaFormState;
    onGeometryMetaFormChange: (key: keyof GeometryMetaFormState, value: string) => void;
    isEntitySubmitting: boolean;
    onApplyGeometryMetadata: () => Promise<{ ok: boolean; error?: string }>;
    changeCount: number;
};

export default function SelectedGeometryPanel({
    selectedFeatures,
    selectedFeatureEntitySummary,
    selectedFeatureBindingSummary,
    entities,
    selectedGeometryEntityIds,
    onEntityIdsChange,
    entityTypeOptions,
    geometryMetaForm,
    onGeometryMetaFormChange,
    isEntitySubmitting,
    onApplyGeometryMetadata,
    changeCount,
}: Props) {
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

    if (!selectedFeatures || selectedFeatures.length === 0) return null;
    const representativeFeature = selectedFeatures[0];

    const groupedEntityTypeOptions = groupEntityTypeOptions(entityTypeOptions);
    const featureGeometryPreset = resolveFeatureGeometryPreset(representativeFeature);
    const allowedGroupIds = getAllowedGroupIdsForPreset(featureGeometryPreset);
    const groupedGeoTypeOptions = groupedEntityTypeOptions.filter((group) =>
        allowedGroupIds.includes(group.id)
    );
    const selectedTypeOption = findEntityTypeOption(geometryMetaForm.type_key);
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
                    Entity & Geometry
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
                <div style={{ color: "#e2e8f0" }}>
                    ID: {selectedFeatures.map(f => String(f.properties.id)).join(", ")}
                </div>
                <div style={{ color: "#cbd5e1" }}>
                    Entities hiện tại: {selectedFeatureEntitySummary}
                </div>
                <div style={{ color: "#cbd5e1" }}>
                    Binding hiện tại: {selectedFeatureBindingSummary}
                </div>
                <div style={{ color: "#cbd5e1" }}>
                    Geometry preset: {formatGeometryPresetLabel(featureGeometryPreset)}
                </div>

                <div style={{ color: "#94a3b8", fontSize: "12px" }}>
                    Entities đã chọn:
                </div>
                {selectedGeometryEntityIds.length ? (
                    <div style={{ display: "grid", gap: "6px" }}>
                        {selectedGeometryEntityIds.map((entityId) => {
                            const entity = entities.find((item) => item.id === entityId) || null;
                            const label = entity?.name
                                ? `${entity.name} (${entityId})`
                                : entityId;

                            return (
                                <div
                                    key={entityId}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "8px",
                                        background: "#111827",
                                        border: "1px solid #334155",
                                        borderRadius: "6px",
                                        padding: "6px 8px",
                                    }}
                                >
                                    <span style={{ color: "#e2e8f0" }}>{label}</span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onEntityIdsChange(
                                                selectedGeometryEntityIds.filter((id) => id !== entityId)
                                            )
                                        }
                                        disabled={isEntitySubmitting}
                                        style={removeButtonStyle}
                                    >
                                        Bỏ
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ color: "#fca5a5", fontSize: "12px" }}>
                        Chưa có entity nào được gắn.
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
                        <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "12px" }}>
                            Loại GEO
                        </div>
                        <select
                            value={geometryMetaForm.type_key}
                            onChange={(event) => onGeometryMetaFormChange("type_key", event.target.value)}
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
                            onChange={(event) => onGeometryMetaFormChange("time_start", event.target.value)}
                            placeholder="time_start"
                            disabled={isEntitySubmitting}
                            style={entityInputStyle}
                        />
                        <input
                            value={geometryMetaForm.time_end}
                            onChange={(event) => onGeometryMetaFormChange("time_end", event.target.value)}
                            placeholder="time_end"
                            disabled={isEntitySubmitting}
                            style={entityInputStyle}
                        />
                        {/*<input*/}
                        {/*    value={geometryMetaForm.binding}*/}
                        {/*    onChange={(event) => onGeometryMetaFormChange("binding", event.target.value)}*/}
                        {/*    placeholder="binding (geometry ids, comma separated)"*/}
                        {/*    disabled={isEntitySubmitting}*/}
                        {/*    style={entityInputStyle}*/}
                        {/*/>*/}
                        <button
                            type="button"
                            onClick={handleApplyGeoMeta}
                            disabled={isEntitySubmitting}
                            style={primaryGeometryButtonStyle}
                        >
                            Apply
                        </button>
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

const removeButtonStyle: CSSProperties = {
    border: "none",
    borderRadius: "6px",
    padding: "4px 8px",
    cursor: "pointer",
    background: "#7f1d1d",
    color: "#ffffff",
    fontSize: "12px",
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

function resolveFeatureGeometryPreset(feature: Feature): EntityGeometryPreset {
    const explicitPreset = normalizeGeometryPreset(feature.properties.geometry_preset);
    if (explicitPreset) return explicitPreset;

    const semanticType = normalizeTypeId(feature.properties.type) || normalizeTypeId(feature.properties.entity_type_id);
    if (semanticType) {
        const option = findEntityTypeOption(semanticType);
        if (option) return option.geometryPreset;
    }

    return mapGeometryTypeToPreset(feature.geometry.type);
}

function normalizeGeometryPreset(value: unknown): EntityGeometryPreset | null {
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
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length ? normalized : null;
}

function mapGeometryTypeToPreset(
    geometryType: Feature["geometry"]["type"]
): EntityGeometryPreset {
    if (geometryType === "Point" || geometryType === "MultiPoint") {
        return "point";
    }
    if (geometryType === "LineString" || geometryType === "MultiLineString") {
        return "line";
    }
    return "polygon";
}

function getAllowedGroupIdsForPreset(
    geometryPreset: EntityGeometryPreset
): EntityTypeGroupId[] {
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

function formatGeometryPresetLabel(preset: EntityGeometryPreset | null): string {
    if (preset === "point") return "point - Điểm";
    if (preset === "line") return "line - Tuyến";
    if (preset === "circle-area") return "circle - Tròn";
    if (preset === "polygon") return "polygon - Đa giác";
    return "unknown";
}
