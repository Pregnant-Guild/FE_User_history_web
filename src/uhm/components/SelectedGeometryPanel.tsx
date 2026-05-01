"use client";

import { type CSSProperties } from "react";
import { Entity } from "@/uhm/api/entities";
import { Feature } from "@/uhm/lib/useEditorState";
import {
    EntityGeometryPreset,
    EntityTypeGroupId,
    EntityTypeOption,
    findEntityTypeOption,
    groupEntityTypeOptions,
} from "@/uhm/lib/entityTypeOptions";
import type { EntityFormState, GeometryMetaFormState } from "@/uhm/lib/editor/session/sessionTypes";

type Props = {
    selectedFeature: Feature | null;
    selectedFeatureEntitySummary: string;
    selectedFeatureBindingSummary: string;
    entities: Entity[];
    selectedGeometryEntityIds: string[];
    onEntityIdsChange: (values: string[]) => void;
    entitySearchQuery: string;
    onEntitySearchQueryChange: (value: string) => void;
    entitySearchResults: Entity[];
    selectedSearchEntityId: string | null;
    onSelectSearchEntityId: (value: string | null) => void;
    onAddSelectedSearchEntity: () => void;
    isEntitySearchLoading: boolean;
    entityForm: EntityFormState;
    onEntityFormChange: (key: keyof EntityFormState, value: string) => void;
    entityTypeOptions: EntityTypeOption[];
    geometryMetaForm: GeometryMetaFormState;
    onGeometryMetaFormChange: (key: keyof GeometryMetaFormState, value: string) => void;
    isEntitySubmitting: boolean;
    onCreateEntityOnly: () => void;
    onApplyGeometryMetadata: () => void;
    onApplyEntitiesForSelectedGeometry: () => void;
    changeCount: number;
    entityFormStatus: string | null;
};

export default function SelectedGeometryPanel({
    selectedFeature,
    selectedFeatureEntitySummary,
    selectedFeatureBindingSummary,
    entities,
    selectedGeometryEntityIds,
    onEntityIdsChange,
    entitySearchQuery,
    onEntitySearchQueryChange,
    entitySearchResults,
    selectedSearchEntityId,
    onSelectSearchEntityId,
    onAddSelectedSearchEntity,
    isEntitySearchLoading,
    entityForm,
    onEntityFormChange,
    entityTypeOptions,
    geometryMetaForm,
    onGeometryMetaFormChange,
    isEntitySubmitting,
    onCreateEntityOnly,
    onApplyGeometryMetadata,
    onApplyEntitiesForSelectedGeometry,
    changeCount,
    entityFormStatus,
}: Props) {
    const groupedEntityTypeOptions = groupEntityTypeOptions(entityTypeOptions);
    const featureGeometryPreset = selectedFeature
        ? resolveFeatureGeometryPreset(selectedFeature)
        : null;
    const allowedGroupIds = featureGeometryPreset
        ? getAllowedGroupIdsForPreset(featureGeometryPreset)
        : [];
    const visibleGroupedEntityTypeOptions = groupedEntityTypeOptions.filter((group) =>
        allowedGroupIds.includes(group.id)
    );
    const groupedEntityTypeOptionsForCreate = selectedFeature
        ? visibleGroupedEntityTypeOptions
        : groupedEntityTypeOptions;
    const selectedTypeOption = findEntityTypeOption(entityForm.type_id);
    const hasCurrentVisibleTypeOption = groupedEntityTypeOptionsForCreate.some((group) =>
        group.options.some((option) => option.value === entityForm.type_id)
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
            <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "14px" }}>
                Entity & Geometry
            </div>

            {!selectedFeature ? (
                <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                    Chưa chọn geometry. Tạo entity mới ở khối bên dưới, hoặc vào mode Select để bind entity cho geometry.
                </div>
            ) : (
                <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
                    <div style={{ color: "#e2e8f0" }}>
                        ID: {String(selectedFeature.properties.id)}
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
                        <button
                            type="button"
                            onClick={onApplyGeometryMetadata}
                            disabled={isEntitySubmitting}
                            style={primaryGeometryButtonStyle}
                        >
                            Apply
                        </button>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gap: "8px",
                            border: "1px solid #1f3b5a",
                            borderRadius: "8px",
                            padding: "8px",
                            background: "#0f172a",
                        }}
                    >
                        <div style={{ color: "#bfdbfe", fontWeight: 700, fontSize: "12px" }}>
                            Bind entity có sẵn
                        </div>
                        <div style={{ color: "#93c5fd", fontSize: "11px" }}>
                            Dùng khi entity đã tồn tại. Tìm kiếm, thêm vào danh sách rồi bấm nút áp dụng.
                        </div>
                        <input
                            value={entitySearchQuery}
                            onChange={(event) => onEntitySearchQueryChange(event.target.value)}
                            placeholder="Search entity theo name..."
                            disabled={isEntitySubmitting}
                            style={entityInputStyle}
                        />
                        <select
                            value={selectedSearchEntityId || ""}
                            onChange={(event) =>
                                onSelectSearchEntityId(event.target.value ? event.target.value : null)
                            }
                            disabled={isEntitySubmitting || isEntitySearchLoading}
                            style={entityInputStyle}
                        >
                            <option value="">-- Chọn entity từ kết quả search --</option>
                            {entitySearchResults.map((entity) => (
                                <option key={entity.id} value={entity.id}>
                                    {entity.name} ({entity.id})
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={onAddSelectedSearchEntity}
                            disabled={isEntitySubmitting || isEntitySearchLoading}
                            style={secondaryActionButtonStyle}
                        >
                            Thêm entity đã chọn vào danh sách gắn
                        </button>
                        {isEntitySearchLoading ? (
                            <div style={{ color: "#93c5fd", fontSize: "12px" }}>
                                Đang tìm entity...
                            </div>
                        ) : null}
                        <button
                            onClick={onApplyEntitiesForSelectedGeometry}
                            disabled={isEntitySubmitting}
                            style={{
                                border: "none",
                                borderRadius: "6px",
                                padding: "7px 8px",
                                cursor: isEntitySubmitting ? "not-allowed" : "pointer",
                                background: "#0f766e",
                                color: "#ffffff",
                                opacity: isEntitySubmitting ? 0.7 : 1,
                                fontWeight: 600,
                            }}
                        >
                            Áp dụng danh sách entity
                        </button>
                    </div>

                    {changeCount > 0 ? (
                        <div style={{ color: "#fca5a5", fontSize: "12px" }}>
                            Thay đổi sẽ vào lịch sử khi Commit.
                        </div>
                    ) : null}
                </div>
            )}

            <div
                style={{
                    display: "grid",
                    gap: "8px",
                    border: "1px solid #1e3a8a",
                    borderRadius: "8px",
                    padding: "8px",
                    background: "#0f172a",
                    marginTop: "10px",
                }}
            >
                <div style={{ color: "#bfdbfe", fontWeight: 700, fontSize: "12px" }}>
                    Tạo entity mới (độc lập)
                </div>
                <div style={{ color: "#93c5fd", fontSize: "11px" }}>
                    Chỉ tạo entity, không tự bind vào geometry.
                </div>
                {selectedFeature ? (
                    <div style={{ color: "#93c5fd", fontSize: "11px" }}>
                        Type đang bị giới hạn theo geometry: <b>{formatGeometryPresetLabel(featureGeometryPreset)}</b>.
                    </div>
                ) : null}

                <input
                    value={entityForm.name}
                    onChange={(event) => onEntityFormChange("name", event.target.value)}
                    placeholder="Tên entity mới"
                    disabled={isEntitySubmitting}
                    style={entityInputStyle}
                />
                <input
                    value={entityForm.slug}
                    onChange={(event) => onEntityFormChange("slug", event.target.value)}
                    placeholder="Slug"
                    disabled={isEntitySubmitting}
                    style={entityInputStyle}
                />
                <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "12px" }}>
                    Chọn loại entity
                </div>
                <select
                    value={entityForm.type_id}
                    onChange={(event) => onEntityFormChange("type_id", event.target.value)}
                    disabled={isEntitySubmitting}
                    style={entityInputStyle}
                >
                    {!selectedFeature && !hasCurrentVisibleTypeOption && entityForm.type_id ? (
                        <option value={entityForm.type_id}>
                            Custom Type ({entityForm.type_id})
                        </option>
                    ) : null}
                    {groupedEntityTypeOptionsForCreate.map((group) => (
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
                        Type đang chọn: <b>{selectedTypeOption.label}</b> ({selectedTypeOption.groupLabel})
                    </div>
                ) : entityForm.type_id ? (
                    <div style={{ color: "#cbd5e1", fontSize: "12px" }}>
                        Type đang chọn: <b>{entityForm.type_id}</b>
                    </div>
                ) : null}

                <button
                    onClick={onCreateEntityOnly}
                    disabled={isEntitySubmitting}
                    style={{
                        border: "none",
                        borderRadius: "6px",
                        padding: "7px 8px",
                        cursor: isEntitySubmitting ? "not-allowed" : "pointer",
                        background: "#2563eb",
                        color: "#ffffff",
                        opacity: isEntitySubmitting ? 0.7 : 1,
                        fontWeight: 600,
                    }}
                >
                    Tạo entity mới
                </button>
            </div>

            {entityFormStatus ? (
                <div style={{ color: "#93c5fd", fontSize: "12px", marginTop: "8px" }}>
                    {entityFormStatus}
                </div>
            ) : null}
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

const secondaryActionButtonStyle: CSSProperties = {
    border: "none",
    borderRadius: "6px",
    padding: "7px 8px",
    cursor: "pointer",
    background: "#1d4ed8",
    color: "#ffffff",
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
