import { API_ENDPOINTS } from "@/uhm/api/config";
import { requestJson } from "@/uhm/api/http";
import type { BattleReplay } from "@/uhm/types/projects";

const BATCH_SIZE = 20;
const BATCH_CONCURRENCY = 6;

export async function fetchBattleReplaysByGeometryIds(geometryIds: string[]): Promise<Record<string, BattleReplay[]>> {
    const uniqueIds = Array.from(new Set(
        (geometryIds || [])
            .map((id) => String(id || "").trim())
            .filter((id) => id.length > 0)
    ));

    if (!uniqueIds.length) {
        return {};
    }

    const chunks: string[][] = [];
    for (let index = 0; index < uniqueIds.length; index += BATCH_SIZE) {
        chunks.push(uniqueIds.slice(index, index + BATCH_SIZE));
    }

    const results: Array<Record<string, BattleReplay[]>> = new Array(chunks.length);
    const runnerCount = Math.max(1, Math.min(BATCH_CONCURRENCY, chunks.length));
    let nextIndex = 0;

    await Promise.all(
        Array.from({ length: runnerCount }, async () => {
            while (true) {
                const current = nextIndex++;
                if (current >= chunks.length) return;
                
                const batch = chunks[current];
                const params = new URLSearchParams();
                for (const id of batch) {
                    params.append("geometry_ids", id);
                }

                try {
                    results[current] = await requestJson<Record<string, BattleReplay[]>>(
                        `${API_ENDPOINTS.battleReplays}/geometries?${params.toString()}`
                    );
                } catch (err) {
                    console.error("Failed to fetch battle replays batch", err);
                    results[current] = {};
                }
            }
        })
    );

    const merged: Record<string, BattleReplay[]> = {};
    for (const res of results) {
        if (!res) continue;
        for (const [key, list] of Object.entries(res)) {
            merged[key] = list || [];
        }
    }

    return merged;
}
