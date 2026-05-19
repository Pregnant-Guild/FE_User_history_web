import type { ProjectCommit } from "@/uhm/api/projects";
import type { EntitySnapshot } from "@/uhm/types/entities";
import type { Feature, Geometry } from "@/uhm/types/geo";
import type { BattleReplay } from "@/uhm/types/projects";
import type { WikiSnapshot } from "@/uhm/types/wiki";

// Giới hạn kích thước panel khi drag resize để tránh layout bị vỡ.
export function clampNumber(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

// Tạo label ngắn cho commit history, ưu tiên summary người dùng nhập.
export function formatCommitTitle(commit: ProjectCommit): string {
    return commit.edit_summary?.trim() || `Commit ${commit.id.slice(0, 8)}`;
}

// Kiểm tra feature có nằm trong năm timeline đang active hay không.
export function isFeatureVisibleAtYear(feature: Feature, year: number): boolean {
    const start = feature.properties.time_start;
    const end = feature.properties.time_end;
    if (typeof start === "number" && Number.isFinite(start) && year < start) return false;
    if (typeof end === "number" && Number.isFinite(end) && year > end) return false;
    return true;
}

// Chuẩn hóa wiki snapshot để so sánh dirty-state ổn định, không phụ thuộc thứ tự mảng.
export function normalizeWikisForCompare(input: WikiSnapshot[] | null | undefined) {
    const list = Array.isArray(input) ? input : [];
    return list
        .filter((w) => w && typeof w.id === "string" && w.id.trim().length > 0)
        .filter((w) => {
            if (w.source === "ref") return true;
            if (w.operation === "create" || w.operation === "update" || w.operation === "delete") return true;
            const title = typeof w.title === "string" ? w.title.trim() : "";
            const doc = typeof w.doc === "string" ? w.doc.trim() : "";
            return title.length > 0 || (w.doc !== null && doc.length > 0);
        })
        .map((w) => ({
            id: w.id,
            source: w.source,
            title: typeof w.title === "string" ? w.title.trim() : "",
            slug: typeof w.slug === "string" ? w.slug : null,
            doc: w.doc === null ? null : typeof w.doc === "string" ? w.doc.trim() : null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

// Chuẩn hóa entity snapshot để phát hiện thay đổi name/description/source.
export function normalizeEntitiesForCompare(input: EntitySnapshot[] | null | undefined) {
    const list = Array.isArray(input) ? input : [];
    return list
        .filter((e) => e && (typeof e.id === "string" || typeof e.id === "number"))
        .map((e) => ({
            id: String(e.id),
            source: e.source,
            name: typeof e.name === "string" ? e.name.trim() : "",
            description: e.description == null ? null : String(e.description),
            time_start: typeof e.time_start === "number" ? e.time_start : null,
            time_end: typeof e.time_end === "number" ? e.time_end : null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

// Chuẩn hóa binding entity-wiki để dirty check không bị nhiễu bởi thứ tự.
export function normalizeEntityWikiLinksForCompare(
    input: Array<{ entity_id: string; wiki_id: string; operation?: string }> | null | undefined
) {
    const list = Array.isArray(input) ? input : [];
    return list
        .filter((l) => l && typeof l.entity_id === "string" && typeof l.wiki_id === "string")
        .map((l) => ({
            entity_id: l.entity_id,
            wiki_id: l.wiki_id,
            operation: l.operation === "delete" ? "delete" : "binding",
        }))
        .sort((a, b) => (a.entity_id + a.wiki_id).localeCompare(b.entity_id + b.wiki_id));
}

// Chuẩn hóa replay để phát hiện thay đổi script/target geometry.
export function normalizeReplaysForCompare(input: BattleReplay[] | null | undefined) {
    const list = Array.isArray(input) ? input : [];
    return list
        .filter((replay) => replay && typeof replay.geometry_id === "string" && replay.geometry_id.trim().length > 0)
        .map((replay) => ({
            id: typeof replay.id === "string" ? replay.id : replay.geometry_id,
            geometry_id: replay.geometry_id,
            target_geometry_ids: normalizeReplayTargetGeometryIdsForCompare(
                replay.target_geometry_ids,
                replay.geometry_id
            ),
            detail: Array.isArray(replay.detail) ? replay.detail : [],
        }))
        .sort((a, b) => a.geometry_id.localeCompare(b.geometry_id));
}

// Bảo toàn geometry chính ở vị trí đầu và loại bỏ id trùng trong replay target list.
function normalizeReplayTargetGeometryIdsForCompare(
    input: string[] | null | undefined,
    geometryId: string
) {
    const orderedIds: string[] = [];
    const seen = new Set<string>();

    const pushId = (rawId: string | number | null | undefined) => {
        if (rawId == null) return;
        const id = String(rawId).trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        orderedIds.push(id);
    };

    pushId(geometryId);
    for (const rawId of input || []) pushId(rawId);
    return orderedIds;
}

// Validate tối thiểu geometry trả về từ search trước khi đưa vào draft.
export function normalizeGeoSearchGeometry(value: unknown): Geometry | null {
    if (!value || typeof value !== "object") return null;
    const geometry = value as Record<string, unknown>;
    if (typeof geometry.type !== "string") return null;
    if (!("coordinates" in geometry)) return null;
    return value as Geometry;
}

// Chuẩn hóa danh sách binding id từ API search GEO.
export function normalizeGeoSearchBindingIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const rawId of value) {
        if (typeof rawId !== "string" && typeof rawId !== "number") continue;
        const id = String(rawId).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        deduped.push(id);
    }
    return deduped;
}
