"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Entity } from "@/uhm/api/entities";
import type { Feature, FeatureProperties } from "@/uhm/types/geo";
import { ApiError } from "@/uhm/api/http";
import { buildFeatureEntityPatch } from "@/uhm/lib/editor/entity/entityBinding";
import { buildGeometryMetadataPatch } from "@/uhm/lib/editor/geometry/geometryMetadata";
import { uniqueEntityIds } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import type { GeometryMetaFormState } from "@/uhm/lib/editor/session/sessionTypes";

type EditorDraftApi = {
    patchFeatureProperties: (id: FeatureProperties["id"], patch: Partial<FeatureProperties>) => void;
    patchFeaturePropertiesBatch: (
        patches: Array<{ id: FeatureProperties["id"]; patch: Partial<FeatureProperties> }>,
        label?: string
    ) => void;
};

type Options = {
    editor: EditorDraftApi;
    selectedFeatures: Feature[];
    geometryMetaForm: GeometryMetaFormState;
    setGeometryMetaForm: Dispatch<SetStateAction<GeometryMetaFormState>>;
    selectedGeometryEntityIds: string[];
    setSelectedGeometryEntityIds: Dispatch<SetStateAction<string[]>>;
    entities: Entity[];
    setIsEntitySubmitting: Dispatch<SetStateAction<boolean>>;
    setEntityFormStatus: Dispatch<SetStateAction<string | null>>;
};

export function useFeatureCommands(options: Options) {
    const {
        editor,
        selectedFeatures,
        geometryMetaForm,
        setGeometryMetaForm,
        selectedGeometryEntityIds,
        setSelectedGeometryEntityIds,
        entities,
        setIsEntitySubmitting,
        setEntityFormStatus,
    } = options;

    // Áp metadata GEO (type/time/binding) cho toàn bộ selectedFeatures.
    const applyGeometryMetadata = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        if (!selectedFeatures || selectedFeatures.length === 0) {
            const msg = "Hãy chọn ít nhất một geometry trước.";
            setEntityFormStatus(msg);
            return { ok: false, error: msg };
        }

        let metadata;
        try {
            metadata = buildGeometryMetadataPatch(geometryMetaForm);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Thời gian không hợp lệ.";
            setEntityFormStatus(msg);
            return { ok: false, error: msg };
        }

        setIsEntitySubmitting(true);
        setEntityFormStatus(null);
        try {
            editor.patchFeaturePropertiesBatch(
                selectedFeatures.map((feature) => ({
                    id: feature.properties.id,
                    patch: metadata.patch,
                })),
                "Cập nhật thuộc tính GEO"
            );
            setGeometryMetaForm(metadata.formState);
            setEntityFormStatus("Đã cập nhật thuộc tính GEO. Commit khi sẵn sàng.");
            return { ok: true };
        } finally {
            setIsEntitySubmitting(false);
        }
    }, [
        editor,
        geometryMetaForm,
        selectedFeatures,
        setEntityFormStatus,
        setGeometryMetaForm,
        setIsEntitySubmitting,
    ]);

    // Áp danh sách entity đã chọn vào toàn bộ selectedFeatures.
    const applyEntitiesToSelectedGeometry = useCallback(async () => {
        if (!selectedFeatures || selectedFeatures.length === 0) {
            setEntityFormStatus("Hãy chọn ít nhất một geometry trước.");
            return;
        }

        const entityIds = uniqueEntityIds(selectedGeometryEntityIds);
        setIsEntitySubmitting(true);
        setEntityFormStatus(null);
        try {
            editor.patchFeaturePropertiesBatch(
                selectedFeatures.map((feature) => ({
                    id: feature.properties.id,
                    patch: buildFeatureEntityPatch(feature, entityIds, entities),
                })),
                "Cập nhật entity cho GEO"
            );
            setSelectedGeometryEntityIds(entityIds);
            setEntityFormStatus("Đã cập nhật danh sách entity. Commit khi sẵn sàng.");
        } catch (err) {
            if (err instanceof ApiError) {
                setEntityFormStatus(`Lưu thất bại: ${err.body}`);
            } else {
                setEntityFormStatus("Lưu thất bại.");
            }
        } finally {
            setIsEntitySubmitting(false);
        }
    }, [
        editor,
        entities,
        selectedFeatures,
        selectedGeometryEntityIds,
        setEntityFormStatus,
        setIsEntitySubmitting,
        setSelectedGeometryEntityIds,
    ]);

    return {
        applyGeometryMetadata,
        applyEntitiesToSelectedGeometry,
    };
}
