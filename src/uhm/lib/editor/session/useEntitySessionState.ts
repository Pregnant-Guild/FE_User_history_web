import { useState } from "react";
import type { Entity } from "@/uhm/types/entities";
import type { FeatureId } from "@/uhm/types/geo";
import { DEFAULT_ENTITY_TYPE_ID } from "@/uhm/lib/entityTypeOptions";
import type {
    CreatedEntitySummary,
    EntityFormState,
    GeometryMetaFormState,
    PendingEntityCreate,
} from "@/uhm/lib/editor/session/sessionTypes";

export function useEntitySessionState() {
    // Entities đã persisted từ backend (dùng cho search/binding).
    const [persistedEntities, setPersistedEntities] = useState<Entity[]>([]);
    // Entities tạo mới trong phiên nhưng chưa commit lên backend.
    const [pendingEntityCreates, setPendingEntityCreates] = useState<PendingEntityCreate[]>([]);
    // Tóm tắt entities đã tạo (để hiển thị nhanh ở sidebar).
    const [createdEntities, setCreatedEntities] = useState<CreatedEntitySummary[]>([]);
    // Thông báo trạng thái/lỗi liên quan entity/session.
    const [entityStatus, setEntityStatus] = useState<string | null>(null);
    // Feature đang được chọn để thao tác bind entities/metadata.
    const [selectedFeatureId, setSelectedFeatureId] = useState<FeatureId | null>(null);
    // Form tạo entity mới (độc lập).
    const [entityForm, setEntityForm] = useState<EntityFormState>({
        name: "",
        slug: "",
        type_id: DEFAULT_ENTITY_TYPE_ID,
    });
    // Danh sách entity IDs đang chọn để bind vào geometry hiện tại.
    const [selectedGeometryEntityIds, setSelectedGeometryEntityIds] = useState<string[]>([]);
    // Form metadata geometry (time range + binding ids).
    const [geometryMetaForm, setGeometryMetaForm] = useState<GeometryMetaFormState>({
        time_start: "",
        time_end: "",
        binding: "",
    });
    // Cờ loading khi apply entity/metadata (local submit).
    const [isEntitySubmitting, setIsEntitySubmitting] = useState(false);
    // Thông báo trạng thái/lỗi cho form entity/metadata.
    const [entityFormStatus, setEntityFormStatus] = useState<string | null>(null);
    // Keyword search entity theo name.
    const [entitySearchQuery, setEntitySearchQuery] = useState("");
    // Kết quả search entity để user chọn.
    const [entitySearchResults, setEntitySearchResults] = useState<Entity[]>([]);
    // Entity ID đang được chọn trong dropdown kết quả search.
    const [selectedSearchEntityId, setSelectedSearchEntityId] = useState<string | null>(null);
    // Cờ loading khi search entity.
    const [isEntitySearchLoading, setIsEntitySearchLoading] = useState(false);

    return {
        persistedEntities,
        setPersistedEntities,
        pendingEntityCreates,
        setPendingEntityCreates,
        createdEntities,
        setCreatedEntities,
        entityStatus,
        setEntityStatus,
        selectedFeatureId,
        setSelectedFeatureId,
        entityForm,
        setEntityForm,
        selectedGeometryEntityIds,
        setSelectedGeometryEntityIds,
        geometryMetaForm,
        setGeometryMetaForm,
        isEntitySubmitting,
        setIsEntitySubmitting,
        entityFormStatus,
        setEntityFormStatus,
        entitySearchQuery,
        setEntitySearchQuery,
        entitySearchResults,
        setEntitySearchResults,
        selectedSearchEntityId,
        setSelectedSearchEntityId,
        isEntitySearchLoading,
        setIsEntitySearchLoading,
    };
}
