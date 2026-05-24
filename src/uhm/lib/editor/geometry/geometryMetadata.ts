import type { Feature, FeatureProperties } from "@/uhm/types/geo";
import type { GeometryMetaFormState } from "@/uhm/lib/editor/session/sessionTypes";
import { normalizeFeatureBoundWith } from "@/uhm/lib/editor/geometry/geometryBinding";

export type GeometryMetadataPatch = {
    patch: Partial<FeatureProperties>;
    formState: GeometryMetaFormState;
};

export function buildGeometryMetadataPatch(form: GeometryMetaFormState): GeometryMetadataPatch {
    const typeKey = form.type_key.trim();
    const timeStart = parseOptionalYearInput(form.time_start, "time_start");
    const timeEnd = parseOptionalYearInput(form.time_end, "time_end");
    if (timeStart !== null && timeEnd !== null && timeStart > timeEnd) {
        throw new Error("time_start phải <= time_end.");
    }

    return {
        patch: {
            type: typeKey.length ? typeKey : undefined,
            time_start: timeStart,
            time_end: timeEnd,
        },
        formState: {
            type_key: typeKey,
            time_start: timeStart != null ? String(timeStart) : "",
            time_end: timeEnd != null ? String(timeEnd) : "",
        },
    };
}

export function formatBoundWithForDisplay(feature: Feature): string {
    return normalizeFeatureBoundWith(feature) || "Không có";
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
