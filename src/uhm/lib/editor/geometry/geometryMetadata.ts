import type { Feature, FeatureProperties } from "@/uhm/types/geo";
import type { GeometryMetaFormState } from "@/uhm/lib/editor/session/sessionTypes";
import {
    normalizeFeatureBindingIds,
    parseBindingInput,
} from "@/uhm/lib/editor/snapshot/editorSnapshot";

export type GeometryMetadataPatch = {
    patch: Partial<FeatureProperties>;
    formState: GeometryMetaFormState;
};

export function buildGeometryMetadataPatch(form: GeometryMetaFormState): GeometryMetadataPatch {
    const timeStart = parseOptionalYearInput(form.time_start, "time_start");
    const timeEnd = parseOptionalYearInput(form.time_end, "time_end");
    if (timeStart !== null && timeEnd !== null && timeStart > timeEnd) {
        throw new Error("time_start phải <= time_end.");
    }

    const bindingIds = parseBindingInput(form.binding);
    return {
        patch: {
            time_start: timeStart,
            time_end: timeEnd,
            binding: bindingIds,
        },
        formState: {
            time_start: timeStart != null ? String(timeStart) : "",
            time_end: timeEnd != null ? String(timeEnd) : "",
            binding: bindingIds.join(", "),
        },
    };
}

export function formatBindingIdsForDisplay(feature: Feature): string {
    const bindingIds = normalizeFeatureBindingIds(feature);
    if (!bindingIds.length) return "Không có";
    return bindingIds.join(", ");
}

function parseOptionalYearInput(raw: string, fieldName: string): number | null {
    const value = raw.trim();
    if (!value.length) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${fieldName} phải là số.`);
    }
    return Math.trunc(parsed);
}

