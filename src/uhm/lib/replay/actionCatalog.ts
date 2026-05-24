import type { UIOptionName } from "@/uhm/types/projects";

export const REPLAY_UI_OPTIONS = [
    "timeline",
    "layer_panel",
    "zoom_panel",
    "wiki",
    "toast",
] as const satisfies UIOptionName[];

export function normalizeReplayUiOption(value: unknown): UIOptionName | null {
    return REPLAY_UI_OPTIONS.includes(value as UIOptionName)
        ? value as UIOptionName
        : null;
}
