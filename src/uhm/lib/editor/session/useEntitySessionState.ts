import { useState } from "react";
import type { Entity } from "@/uhm/types/entities";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { FeatureId } from "@/uhm/types/geo";
import type {
    EntityFormState,
    GeometryMetaFormState,
} from "@/uhm/lib/editor/session/sessionTypes";

export function useEntitySessionState() {
    // Entity catalog loaded from backend (global list, used for search/lookup).
    const [entityCatalog, setEntityCatalog] = useState<Entity[]>([]);
    // Snapshot entity store for the current editor session (single source of truth for snapshot.entities).
    const [snapshotEntities, setSnapshotEntities] = useState<EntitySnapshot[]>([]);
    // Thông báo trạng thái/lỗi liên quan entity/session.
    const [entityStatus, setEntityStatus] = useState<string | null>(null);
    // Features đang được chọn để thao tác bind entities/metadata.
    const [selectedFeatureIds, setSelectedFeatureIds] = useState<FeatureId[]>([]);
    // Form tạo entity mới (độc lập).
    const [entityForm, setEntityForm] = useState<EntityFormState>({
        name: "",
        description: "",
    });
    // Danh sách entity IDs đang chọn để bind vào geometry hiện tại.
    const [selectedGeometryEntityIds, setSelectedGeometryEntityIds] = useState<string[]>([]);
    // Form metadata geometry (time range + binding ids).
    const [geometryMetaForm, setGeometryMetaForm] = useState<GeometryMetaFormState>({
        type_key: "",
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
        entityCatalog,
        setEntityCatalog,
        snapshotEntities,
        setSnapshotEntities,
        entityStatus,
        setEntityStatus,
        selectedFeatureIds,
        setSelectedFeatureIds,
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
