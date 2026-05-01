"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Entity } from "@/uhm/types/entities";
import type { Feature, FeatureProperties } from "@/uhm/types/geo";
import { ApiError } from "@/uhm/api/http";
import { buildFeatureEntityPatch } from "@/uhm/lib/editor/entity/entityBinding";
import { buildGeometryMetadataPatch } from "@/uhm/lib/editor/geometry/geometryMetadata";
import { uniqueEntityIds } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import type { GeometryMetaFormState } from "@/uhm/lib/editor/session/sessionTypes";

type EditorDraftApi = {
    patchFeatureProperties: (id: FeatureProperties["id"], patch: Partial<FeatureProperties>) => void;
};

type Options = {
    editor: EditorDraftApi;
    selectedFeature: Feature | null;
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
        selectedFeature,
        geometryMetaForm,
        setGeometryMetaForm,
        selectedGeometryEntityIds,
        setSelectedGeometryEntityIds,
        entities,
        setIsEntitySubmitting,
        setEntityFormStatus,
    } = options;

    const applyGeometryMetadata = useCallback(async () => {
        if (!selectedFeature) {
            setEntityFormStatus("Hãy chọn một geometry trước.");
            return;
        }

        let metadata;
        try {
            metadata = buildGeometryMetadataPatch(geometryMetaForm);
        } catch (err) {
            setEntityFormStatus(err instanceof Error ? err.message : "Thời gian không hợp lệ.");
            return;
        }

        setIsEntitySubmitting(true);
        setEntityFormStatus(null);
        try {
            editor.patchFeatureProperties(selectedFeature.properties.id, metadata.patch);
            setGeometryMetaForm(metadata.formState);
            setEntityFormStatus("Đã cập nhật thuộc tính GEO. Commit khi sẵn sàng.");
        } finally {
            setIsEntitySubmitting(false);
        }
    }, [
        editor,
        geometryMetaForm,
        selectedFeature,
        setEntityFormStatus,
        setGeometryMetaForm,
        setIsEntitySubmitting,
    ]);

    const applyEntitiesToSelectedGeometry = useCallback(async () => {
        if (!selectedFeature) {
            setEntityFormStatus("Hãy chọn một geometry trước.");
            return;
        }

        const entityIds = uniqueEntityIds(selectedGeometryEntityIds);
        setIsEntitySubmitting(true);
        setEntityFormStatus(null);
        try {
            editor.patchFeatureProperties(
                selectedFeature.properties.id,
                buildFeatureEntityPatch(selectedFeature, entityIds, entities)
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
        selectedFeature,
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

