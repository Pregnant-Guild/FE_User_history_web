"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";
import type {
    BattleReplay,
    GeoFunctionName,
    MapFunctionName,
    NarrativeFunctionName,
    ReplayAction,
    ReplayStep,
    UIOptionName,
} from "@/uhm/types/projects";
import { Panel } from "./Panel";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { fetchWikiBySlug, searchWikisByTitle } from "@/uhm/api/wikis";
import { useEditorStore } from "@/uhm/store/editorStore";

const ReactQuillEditor = dynamic<any>(() => import("react-quill-new"), {
    ssr: false,
    loading: () => <div style={{ height: "120px", background: "#0b1220", borderRadius: "8px" }} className="animate-pulse" />,
});

type Choice = {
    id: string;
    label: string;
};

type Props = {
    width?: number;
    replay: BattleReplay | null;
    selectedStageId: number | null;
    selectedStepIndex: number | null;
    selectedFeatureIds: string[];
    currentTimelineYear: number;
    geometryChoices: Choice[];
    wikiChoices: Choice[];
    getCurrentMapViewState: () => CurrentMapViewState | null;
    onMutateReplay: (label: string, mutator: (draftReplay: BattleReplay) => void) => boolean;
};

type ActionGroupKey = "use_UI_function" | "use_map_function" | "use_geo_function" | "use_narrow_function";
type ActionValue = string | boolean | string[];
type ActionFormValues = Record<string, ActionValue>;
type AnyReplayAction = ReplayAction<UIOptionName | MapFunctionName | GeoFunctionName | NarrativeFunctionName>;

type ActionFieldConfig = {
    name: string;
    label: string;
    kind:
    | "text"
    | "textarea"
    | "rich-text"
    | "number"
    | "boolean"
    | "color"
    | "select"
    | "geometry"
    | "geometry-multi"
    | "wiki";
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
    visibleWhen?: (values: ActionFormValues) => boolean;
};

type ActionDefinition<T extends string> = {
    label: string;
    fields: ActionFieldConfig[];
    create: () => ReplayAction<T>;
    deserialize: (params: unknown[]) => ActionFormValues;
    serialize: (values: ActionFormValues) => unknown[];
};

type NarrativeActionDefinitionMap = Record<NarrativeFunctionName, ActionDefinition<NarrativeFunctionName>>;
type UiVisibleOptionName = "timeline" | "layer_panel" | "zoom_panel";
type UiEffectsDraftState = {
    selected: Record<UIOptionName, boolean>;
    visible: Record<UiVisibleOptionName, boolean>;
    wiki_id: string;
    message: string;
};
type MapCameraOptionName = "center" | "zoom" | "bearing" | "pitch";
type MapCameraDraftState = {
    selected: Record<MapCameraOptionName, boolean>;
};
type CurrentMapViewState = {
    center: { lng: number; lat: number };
    zoom: number;
    pitch: number;
    bearing: number;
    projection: string;
};

const uiOptionChoices: Array<{ label: string; value: UIOptionName }> = [
    { label: "Timeline", value: "timeline" },
    { label: "Layer Panel", value: "layer_panel" },
    { label: "Zoom Panel", value: "zoom_panel" },
    { label: "Wiki", value: "wiki" },
    { label: "Toast", value: "toast" },
];

const uiSimpleOptionValues: UIOptionName[] = [
    "timeline",
    "layer_panel",
    "zoom_panel",
];

const uiInputOptionValues: UIOptionName[] = [
    "wiki",
    "toast",
];

const mapCameraOptionChoices: Array<{ label: string; value: MapCameraOptionName }> = [
    { label: "LngLat", value: "center" },
    { label: "Zoom", value: "zoom" },
    { label: "Bearing", value: "bearing" },
    { label: "Pitch", value: "pitch" },
];

const sidebarStyle = {
    background: "#111827",
    color: "#e5e7eb",
    borderLeft: "1px solid #1f2937",
    padding: "12px",
    height: "100vh",
    overflowY: "auto" as const,
};

const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    boxSizing: "border-box" as const,
    fontSize: 13,
    outline: "none",
};

const buttonStyle = {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#111827",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
};

const narrativeActionDefinitions: NarrativeActionDefinitionMap = {
    set_dialog: {
        label: "Narrative Box",
        fields: [
            { name: "clear", label: "Ẩn narrative (Clear)", kind: "boolean" },
            { name: "image_url", label: "Ảnh tư liệu", kind: "text", placeholder: "https://... (URL ảnh)" },
            { name: "text", label: "Nội dung", kind: "rich-text", placeholder: "Nội dung dẫn chuyện..." },
        ],
        create: () => ({ function_name: "set_dialog", params: [{ avatar: "", text: "", image_url: "", image_caption: "" }] }),
        deserialize: (params) => {
            const data: any = params[0];
            if (data === null) {
                return {
                    clear: true,
                    image_url: "",
                    text: "",
                };
            }
            return {
                clear: false,
                image_url: asString(data?.image_url),
                text: asString(data?.text),
            };
        },
        serialize: (values) => {
            if (values.clear) {
                return [null];
            }
            const data: any = {
                avatar: "",
                text: asString(values.text),
                image_caption: "",
            };
            if (values.image_url) {
                data.image_url = asString(values.image_url);
            }
            return [data];
        },
    },
};

export default function ReplayEffectsSidebar({
    width = 420,
    replay,
    selectedStageId,
    selectedStepIndex,
    selectedFeatureIds,
    currentTimelineYear,
    geometryChoices,
    wikiChoices,
    getCurrentMapViewState,
    onMutateReplay,
}: Props) {
    const wikis = useEditorStore((state) => state.snapshotWikis);

    // Quill: custom link UI (link-to-wiki by slug).
    const wikiLinkIntentRef = useRef<{
        quill: any;
        range: any;
        existingHref: string | null;
    } | null>(null);

    const [isWikiLinkOpen, setIsWikiLinkOpen] = useState(false);
    const [wikiLinkQuery, setWikiLinkQuery] = useState("");
    const [wikiLinkSearchMode, setWikiLinkSearchMode] = useState<"title" | "slug">("title");
    const [wikiLinkError, setWikiLinkError] = useState<string | null>(null);
    const [globalWikiResults, setGlobalWikiResults] = useState<any[]>([]);
    const [isGlobalWikiSearching, setIsGlobalWikiSearching] = useState(false);
    const [globalWikiSearchError, setGlobalWikiSearchError] = useState<string | null>(null);
    const globalWikiSearchRequestRef = useRef(0);

    const handleLinkClick = useCallback((quill: any) => {
        if (!quill) return;
        const range = quill.getSelection?.() ?? null;
        const existingHref =
            range && (quill.getFormat?.(range)?.link ?? quill.getFormat?.(range.index, range.length)?.link) || null;

        wikiLinkIntentRef.current = {
            quill,
            range,
            existingHref: typeof existingHref === "string" ? existingHref : null,
        };

        const selectedText =
            range && range.length > 0 ? String(quill.getText?.(range.index, range.length) || "").trim() : "";
        setWikiLinkQuery(selectedText.slice(0, 80));
        setWikiLinkError(null);
        setIsWikiLinkOpen(true);
    }, []);

    const localWikiLinkCandidates = useMemo(() => {
        if (!isWikiLinkOpen) return [];
        const q = wikiLinkQuery.trim().toLowerCase();

        const base = (wikis || [])
            .filter((w) => w && typeof w.id === "string" && w.operation !== "delete")
            .filter((w) => typeof w.slug === "string" && w.slug.trim().length > 0);

        const filtered = (() => {
            if (!q.length) return base;
            if (wikiLinkSearchMode === "slug") {
                return base.filter((w) => String(w.slug || "").toLowerCase().includes(q));
            }
            return base.filter((w) => (w.title || "").toLowerCase().includes(q));
        })();

        return filtered.slice(0, 20).map((w) => ({
            key: `local:${w.id}`,
            title: (w.title || "").trim() || "Untitled wiki",
            slug: String(w.slug).trim(),
            source: "local" as const,
        }));
    }, [isWikiLinkOpen, wikiLinkQuery, wikiLinkSearchMode, wikis]);

    useEffect(() => {
        if (!isWikiLinkOpen) return;

        const keyword = wikiLinkQuery.trim();
        if (!keyword.length) {
            setGlobalWikiResults([]);
            setIsGlobalWikiSearching(false);
            setGlobalWikiSearchError(null);
            return;
        }

        let disposed = false;
        const requestId = ++globalWikiSearchRequestRef.current;
        const timeoutId = window.setTimeout(async () => {
            setIsGlobalWikiSearching(true);
            setGlobalWikiSearchError(null);
            try {
                const rows =
                    wikiLinkSearchMode === "slug"
                        ? (() => fetchWikiBySlug(keyword))()
                        : (() => searchWikisByTitle(keyword, { limit: 12 }))();

                const resolved = await rows;
                if (disposed || requestId !== globalWikiSearchRequestRef.current) return;

                const list = Array.isArray(resolved) ? resolved : resolved ? [resolved] : [];
                setGlobalWikiResults(list);
            } catch (err) {
                if (disposed || requestId !== globalWikiSearchRequestRef.current) return;
                console.error("Search global wikis failed", err);
                setGlobalWikiResults([]);
                setGlobalWikiSearchError("Không search được wiki trên server.");
            } finally {
                if (!disposed && requestId === globalWikiSearchRequestRef.current) {
                    setIsGlobalWikiSearching(false);
                }
            }
        }, 260);

        return () => {
            disposed = true;
            window.clearTimeout(timeoutId);
        };
    }, [isWikiLinkOpen, wikiLinkQuery, wikiLinkSearchMode]);

    const globalWikiLinkCandidates = useMemo(() => {
        if (!isWikiLinkOpen) return [];
        const out: any[] = [];
        for (const row of globalWikiResults || []) {
            const slug = typeof row?.slug === "string" ? row.slug.trim() : "";
            if (!slug.length) continue;
            out.push({
                key: `global:${row.id || slug}`,
                title: (row.title || "").trim() || "Untitled wiki",
                slug,
                source: "global",
            });
        }
        return out.slice(0, 20);
    }, [globalWikiResults, isWikiLinkOpen]);

    const wikiLinkCandidates = useMemo(() => {
        const localSlugs = new Set(localWikiLinkCandidates.map((w) => w.slug));
        const dedupedGlobal = globalWikiLinkCandidates.filter((w) => !localSlugs.has(w.slug));
        return [...localWikiLinkCandidates, ...dedupedGlobal];
    }, [globalWikiLinkCandidates, localWikiLinkCandidates]);

    const closeWikiLinkModal = useCallback(() => {
        setIsWikiLinkOpen(false);
    }, []);

    const applyWikiLink = useCallback((target: { title: string; slug: string }) => {
        const intent = wikiLinkIntentRef.current;
        const quill = intent?.quill;
        if (!quill) return;

        const slug = target.slug.trim();
        const range = intent?.range ?? quill.getSelection?.() ?? null;
        if (!range) {
            setWikiLinkError("Không lấy được vị trí selection trong editor.");
            return;
        }

        quill.setSelection?.(range.index, range.length, "silent");

        if (range.length > 0) {
            quill.formatText?.(range.index, range.length, "link", slug, "user");
            closeWikiLinkModal();
            return;
        }

        const label = (target.title || "").trim() || slug;
        quill.insertText?.(range.index, label, { link: slug }, "user");
        quill.setSelection?.(range.index + label.length, 0, "silent");
        closeWikiLinkModal();
    }, [closeWikiLinkModal]);

    const applyMissingWikiLink = useCallback(() => {
        const intent = wikiLinkIntentRef.current;
        const quill = intent?.quill;
        if (!quill) return;

        const href = "__missing__";
        const range = intent?.range ?? quill.getSelection?.() ?? null;
        if (!range) {
            setWikiLinkError("Không lấy được vị trí selection trong editor.");
            return;
        }

        quill.setSelection?.(range.index, range.length, "silent");

        if (range.length > 0) {
            quill.formatText?.(range.index, range.length, "link", href, "user");
            closeWikiLinkModal();
            return;
        }

        const label = wikiLinkQuery.trim().slice(0, 120) || "link";
        quill.insertText?.(range.index, label, { link: href }, "user");
        quill.setSelection?.(range.index + label.length, 0, "silent");
        closeWikiLinkModal();
    }, [closeWikiLinkModal, wikiLinkQuery]);

    const removeWikiLink = useCallback(() => {
        const intent = wikiLinkIntentRef.current;
        const quill = intent?.quill;
        if (!quill) return;
        const range = intent?.range ?? quill.getSelection?.() ?? null;
        if (!range) return;
        quill.setSelection?.(range.index, range.length, "silent");
        if (range.length > 0) {
            quill.formatText?.(range.index, range.length, "link", false, "user");
        } else {
            quill.format?.("link", false, "user");
        }
        closeWikiLinkModal();
    }, [closeWikiLinkModal]);

    const isUrlQuery = useMemo(() => {
        const q = wikiLinkQuery.trim();
        return q.startsWith("http://") || q.startsWith("https://") || q.includes("/");
    }, [wikiLinkQuery]);

    const applyExternalLink = useCallback(() => {
        const intent = wikiLinkIntentRef.current;
        const quill = intent?.quill;
        if (!quill) return;

        const href = wikiLinkQuery.trim();
        const range = intent?.range ?? quill.getSelection?.() ?? null;
        if (!range) {
            setWikiLinkError("Không lấy được vị trí selection trong editor.");
            return;
        }

        quill.setSelection?.(range.index, range.length, "silent");

        if (range.length > 0) {
            quill.formatText?.(range.index, range.length, "link", href, "user");
            closeWikiLinkModal();
            return;
        }

        const label = href;
        quill.insertText?.(range.index, label, { link: href }, "user");
        quill.setSelection?.(range.index + label.length, 0, "silent");
        closeWikiLinkModal();
    }, [closeWikiLinkModal, wikiLinkQuery]);

    const stages = useMemo(() => replay?.detail || [], [replay?.detail]);
    const selectedStage =
        stages.find((stage) => stage.id === selectedStageId) ||
        stages[0] ||
        null;
    const selectedStep =
        selectedStage &&
            selectedStepIndex != null &&
            selectedStepIndex >= 0 &&
            selectedStepIndex < selectedStage.steps.length
            ? selectedStage.steps[selectedStepIndex]
            : null;
    const mapCameraActions = useMemo(
        () =>
            (selectedStep?.use_map_function.filter(
                (action) => action.function_name === "set_camera_view"
            ) || []) as ReplayAction<"set_camera_view">[],
        [selectedStep?.use_map_function]
    );
    const nonCameraMapActions = useMemo(
        () =>
            (selectedStep?.use_map_function.filter(
                (action) => action.function_name !== "set_camera_view"
            ) || []) as ReplayAction<MapFunctionName>[],
        [selectedStep?.use_map_function]
    );
    const geoActions = useMemo(
        () => selectedStep?.use_geo_function || [],
        [selectedStep?.use_geo_function]
    );
    const selectedGeometryItems = useMemo(() => {
        const seen = new Set<string>();
        const byId = new Map(geometryChoices.map((choice) => [String(choice.id), choice]));
        return selectedFeatureIds
            .map((id) => String(id).trim())
            .filter((id) => {
                if (!id.length || seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .map((id) => byId.get(id) || { id, label: id });
    }, [geometryChoices, selectedFeatureIds]);
    const updateStep = (label: string, updater: (step: ReplayStep) => void) => {
        if (!selectedStage || selectedStepIndex == null) return;
        onMutateReplay(label, (draftReplay) => {
            const stage = draftReplay.detail.find((item) => item.id === selectedStage.id);
            if (!stage) return;
            if (selectedStepIndex < 0 || selectedStepIndex >= stage.steps.length) return;
            updater(stage.steps[selectedStepIndex]);
        });
    };

    const updateActionGroup = (groupKey: ActionGroupKey, nextActions: AnyReplayAction[], actionLabel: string) => {
        updateStep(actionLabel, (step) => {
            switch (groupKey) {
                case "use_UI_function":
                    step.use_UI_function = nextActions as ReplayStep["use_UI_function"];
                    return;
                case "use_map_function":
                    step.use_map_function = nextActions as ReplayStep["use_map_function"];
                    return;
                case "use_geo_function":
                    step.use_geo_function = nextActions as ReplayStep["use_geo_function"];
                    return;
                case "use_narrow_function":
                    step.use_narrow_function = nextActions as ReplayStep["use_narrow_function"];
                    return;
            }
        });
    };
    const appendMapActions = (nextActions: ReplayAction<MapFunctionName>[], actionLabel: string) => {
        if (!selectedStep || nextActions.length === 0) return;
        updateActionGroup(
            "use_map_function",
            [...selectedStep.use_map_function, ...nextActions],
            actionLabel
        );
    };
    const appendGeoActions = (nextActions: ReplayAction<GeoFunctionName>[], actionLabel: string) => {
        if (!selectedStep || nextActions.length === 0) return;
        updateActionGroup(
            "use_geo_function",
            [...geoActions, ...nextActions],
            actionLabel
        );
    };

    return (
        <aside style={{ ...sidebarStyle, width }}>
            {selectedStage && selectedStep && selectedStepIndex != null ? (
                <>
                    <ActionGroupEditor
                        title="Narrative"
                        groupLabel={`Replay: cập nhật narrative step ${selectedStepIndex + 1} của stage #${selectedStage.id}`}
                        actions={selectedStep.use_narrow_function}
                        definitions={narrativeActionDefinitions}
                        geometryChoices={geometryChoices}
                        wikiChoices={wikiChoices}
                        createOnSelect
                        emptyOptionLabel="Chọn narrative"
                        onUpdateActions={(nextActions, label) =>
                            updateActionGroup("use_narrow_function", nextActions, label)
                        }
                        onLinkClick={handleLinkClick}
                    />
                    <MapFunctionShortcutPanel
                        currentTimelineYear={currentTimelineYear}
                        onAppendActions={appendMapActions}
                    />
                    <GeoFunctionShortcutPanel
                        selectedGeometries={selectedGeometryItems}
                        onAppendActions={appendGeoActions}
                    />
                    <MapCameraViewPanel
                        key={`map-camera-${selectedStage.id}-${selectedStepIndex}`}
                        actions={mapCameraActions}
                        getCurrentMapViewState={getCurrentMapViewState}
                        onApplyAction={(nextAction, label) =>
                            updateActionGroup(
                                "use_map_function",
                                mergeMapActions(
                                    nextAction ? [nextAction] : [],
                                    nonCameraMapActions
                                ),
                                label
                            )
                        }
                    />
                    <UiEffectsEditor
                        key={`ui-${selectedStage.id}-${selectedStepIndex}`}
                        actions={selectedStep.use_UI_function}
                        wikiChoices={wikiChoices}
                        onApplyActions={(nextActions, label) =>
                            updateActionGroup("use_UI_function", nextActions, label)
                        }
                    />
                </>
            ) : (
                <div style={{ color: "#94a3b8", fontSize: 13 }}>
                    Chọn một step ở panel trái để chỉnh hiệu ứng.
                </div>
            )}
            <Modal
                isOpen={isWikiLinkOpen}
                onClose={closeWikiLinkModal}
                className="max-w-[620px] p-6 !bg-[#0f172a] border border-[#1e293b] text-slate-100 rounded-xl dark"
            >
                <div style={{ display: "grid", gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "#ffffff" }}>Chèn Link Wiki</div>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                        <Label className="!text-slate-300">Tìm kiếm wiki hoặc nhập URL</Label>
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <input
                                value={wikiLinkQuery}
                                onChange={(e) => setWikiLinkQuery(e.target.value)}
                                style={{
                                    height: 44,
                                    flex: 1,
                                    minWidth: 0,
                                    borderRadius: 12,
                                    border: "1px solid #334155",
                                    backgroundColor: "transparent",
                                    paddingLeft: 16,
                                    paddingRight: 16,
                                    fontSize: 14,
                                    color: "#f1f5f9",
                                    outline: "none"
                                }}
                                placeholder={wikiLinkSearchMode === "slug" ? "Nhập slug..." : "Nhập tiêu đề hoặc URL..."}
                                autoFocus
                            />
                            <select
                                value={wikiLinkSearchMode}
                                onChange={(e) => setWikiLinkSearchMode(e.target.value === "slug" ? "slug" : "title")}
                                style={{
                                    height: 44,
                                    borderRadius: 12,
                                    border: "1px solid #334155",
                                    backgroundColor: "#0f172a",
                                    paddingLeft: 12,
                                    paddingRight: 12,
                                    fontSize: 14,
                                    color: "#f1f5f9",
                                    outline: "none"
                                }}
                                aria-label="Search mode"
                            >
                                <option value="title">Tiêu đề</option>
                                <option value="slug">Slug</option>
                            </select>
                        </div>
                        {wikiLinkError ? (
                            <div style={{ marginTop: 8, fontSize: 12, color: "#f87171" }}>{wikiLinkError}</div>
                        ) : null}
                        {globalWikiSearchError ? (
                            <div style={{ marginTop: 8, fontSize: 12, color: "#f87171" }}>{globalWikiSearchError}</div>
                        ) : null}
                    </div>

                    <div style={{ maxHeight: 280, overflowY: "auto", borderRadius: 12, border: "1px solid #1e293b", backgroundColor: "#0b1220" }}>
                        <div style={{ padding: 8, display: "grid", gap: 4 }}>
                            {isGlobalWikiSearching ? (
                                <div style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 12, color: "#94a3b8" }}>
                                    Đang tìm kiếm…
                                </div>
                            ) : null}
                            {wikiLinkCandidates.map((w) => (
                                <button
                                    key={w.key}
                                    type="button"
                                    onClick={() => applyWikiLink(w)}
                                    style={{
                                        width: "100%",
                                        textAlign: "left",
                                        borderRadius: 8,
                                        border: "1px solid transparent",
                                        backgroundColor: "transparent",
                                        paddingLeft: 12,
                                        paddingRight: 12,
                                        paddingTop: 8,
                                        paddingBottom: 8,
                                        transition: "all 0.2s",
                                        cursor: "pointer",
                                        color: "#f1f5f9"
                                    }}
                                    className="hover-link-item"
                                    title={w.slug || undefined}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 14, fontWeight: 500, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {(w.title || "").trim() || "Untitled wiki"}
                                            </div>
                                            <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {String(w.slug)}
                                            </div>
                                        </div>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 600,
                                                paddingLeft: 8,
                                                paddingRight: 8,
                                                paddingTop: 2,
                                                paddingBottom: 2,
                                                borderRadius: 9999,
                                                border: w.source === "local" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)",
                                                color: w.source === "local" ? "#34d399" : "#60a5fa"
                                            }}
                                        >
                                            {w.source}
                                        </span>
                                    </div>
                                </button>
                            ))}
                            {wikiLinkCandidates.length === 0 ? (
                                <div style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 16, paddingBottom: 16, fontSize: 14, color: "#94a3b8" }}>
                                    Không tìm thấy wiki phù hợp (hoặc các wiki khác chưa có slug).
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                        {isUrlQuery ? (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={applyExternalLink}
                                className="!bg-[#0284c7] hover:!bg-[#0369a1] !text-white !ring-0 !border-0"
                            >
                                Chèn Link ngoài
                            </Button>
                        ) : null}
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={applyMissingWikiLink}
                            className="!bg-[#334155] hover:!bg-[#475569] !text-slate-100 !ring-0 !border-0"
                        >
                            Link trống
                        </Button>
                        {wikiLinkIntentRef.current?.existingHref ? (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={removeWikiLink}
                                className="!bg-[#b91c1c] hover:!bg-[#991b1b] !text-white !ring-0 !border-0"
                            >
                                Xóa Link
                            </Button>
                        ) : null}
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={closeWikiLinkModal}
                            className="!bg-[#1e293b] hover:!bg-[#334155] !text-slate-300 !ring-0 !border-0"
                        >
                            Hủy
                        </Button>
                    </div>
                </div>
            </Modal>
            <style>{`
                .hover-link-item:hover {
                    border-color: #334155 !important;
                    background-color: rgba(30, 41, 59, 0.5) !important;
                }
            `}</style>
        </aside>
    );
}

function MapFunctionShortcutPanel({
    currentTimelineYear,
    onAppendActions,
}: {
    currentTimelineYear: number;
    onAppendActions: (actions: ReplayAction<MapFunctionName>[], label: string) => void;
}) {
    const safeYear = Math.trunc(currentTimelineYear);

    return (
        <Panel title="Map Functions" defaultOpen>
            <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    <ShortcutButton
                        label="Show Labels"
                        tone="blue"
                        onClick={() =>
                            onAppendActions(
                                [{ function_name: "set_labels_visible", params: [true] }],
                                "Map: show labels"
                            )
                        }
                    />
                    <ShortcutButton
                        label="Hide Labels"
                        tone="slate"
                        onClick={() =>
                            onAppendActions(
                                [{ function_name: "set_labels_visible", params: [false] }],
                                "Map: hide labels"
                            )
                        }
                    />
                    <ShortcutButton
                        label="Enable Filter"
                        tone="green"
                        onClick={() =>
                            onAppendActions(
                                [{ function_name: "set_timeline_filter", params: [true] }],
                                "Map: enable timeline filter"
                            )
                        }
                    />
                    <ShortcutButton
                        label="Disable Filter"
                        tone="slate"
                        onClick={() =>
                            onAppendActions(
                                [{ function_name: "set_timeline_filter", params: [false] }],
                                "Map: disable timeline filter"
                            )
                        }
                    />
                </div>
            </div>
        </Panel>
    );
}

function GeoFunctionShortcutPanel({
    selectedGeometries,
    onAppendActions,
}: {
    selectedGeometries: Choice[];
    onAppendActions: (actions: ReplayAction<GeoFunctionName>[], label: string) => void;
}) {
    const selectedIds = selectedGeometries.map((item) => item.id);
    const selectedCount = selectedIds.length;
    const firstId = selectedIds[0] || "";
    const hasSelection = selectedCount > 0;

    return (
        <Panel title="Geo Functions" badge={`${selectedCount}`} defaultOpen>
            <div style={{ display: "grid", gap: 10 }}>
                {!hasSelection ? (
                    <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.4 }}>
                        Chọn geo trực tiếp trên map replay rồi bấm action tương ứng.
                    </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    <ShortcutButton
                        label="Fly"
                        tone="blue"
                        disabled={!hasSelection}
                        onClick={() =>
                            onAppendActions(
                                [{ function_name: "fly_to_geometries", params: [selectedIds] }],
                                `Geo: fly ${selectedCount} geo`
                            )
                        }
                    />
                    <ShortcutButton
                        label="Follow Path"
                        tone="teal"
                        disabled={!hasSelection}
                        onClick={() =>
                            onAppendActions(
                                [{ function_name: "follow_geometries_path", params: [selectedIds, 5000, 8, 50] }],
                                `Geo: follow path ${selectedCount} geo`
                            )
                        }
                    />
                    <ShortcutButton
                        label="Hiện Geo"
                        tone="green"
                        disabled={!hasSelection}
                        onClick={() =>
                            onAppendActions(
                                [{ function_name: "set_geometry_visibility", params: [selectedIds, true] }],
                                `Geo: show ${selectedCount} geo`
                            )
                        }
                    />
                    <ShortcutButton
                        label="Ẩn Geo"
                        tone="slate"
                        disabled={!hasSelection}
                        onClick={() =>
                            onAppendActions(
                                [{ function_name: "set_geometry_visibility", params: [selectedIds, false] }],
                                `Geo: hide ${selectedCount} geo`
                            )
                        }
                    />
                    <ShortcutButton
                        label="Hide Others"
                        tone="slate"
                        disabled={!hasSelection}
                        onClick={() =>
                            onAppendActions(
                                [{ function_name: "hide_others_geometries", params: [selectedIds] }],
                                `Geo: hide others ngoài ${selectedCount} geo`
                            )
                        }
                    />
                </div>
            </div>
        </Panel>
    );
}

function ShortcutButton({
    label,
    tone,
    disabled = false,
    onClick,
}: {
    label: string;
    tone: "slate" | "blue" | "teal" | "green" | "amber";
    disabled?: boolean;
    onClick: () => void;
}) {
    const backgrounds: Record<typeof tone, string> = {
        slate: "#334155",
        blue: "#1d4ed8",
        teal: "#0f766e",
        green: "#166534",
        amber: "#b45309",
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                ...buttonStyle,
                border: "none",
                background: disabled ? "#1e293b" : backgrounds[tone],
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
            }}
        >
            {label}
        </button>
    );
}

function MapCameraViewPanel({
    actions,
    getCurrentMapViewState,
    onApplyAction,
}: {
    actions: ReplayAction<"set_camera_view">[];
    getCurrentMapViewState: () => CurrentMapViewState | null;
    onApplyAction: (
        nextAction: ReplayAction<"set_camera_view"> | null,
        label: string
    ) => void;
}) {
    const [draft, setDraft] = useState<MapCameraDraftState>(() =>
        buildMapCameraDraftState(actions)
    );
    const activeCount = mapCameraOptionChoices.filter(
        (choice) => draft.selected[choice.value]
    ).length;

    useEffect(() => {
        setDraft(buildMapCameraDraftState(actions));
    }, [actions]);

    return (
        <Panel title="Map Camera View" badge={`${activeCount}`} defaultOpen>
            <div style={{ display: "grid", gap: 12 }}>
                <SimpleOptionToggleRow
                    options={mapCameraOptionChoices.map((choice) => ({
                        value: choice.value,
                        label: choice.label,
                        selected: draft.selected[choice.value],
                    }))}
                    onToggleOption={(option) =>
                        setDraft((prev) => ({
                            selected: {
                                ...prev.selected,
                                [option]: !prev.selected[option],
                            },
                        }))
                    }
                />
                <button
                    type="button"
                    onClick={() => {
                        const hasSelectedOption = mapCameraOptionChoices.some(
                            (choice) => draft.selected[choice.value]
                        );
                        if (!hasSelectedOption) {
                            onApplyAction(null, buildMapCameraApplyLabel(draft));
                            return;
                        }
                        const currentMapViewState = getCurrentMapViewState();
                        if (!currentMapViewState) return;
                        const nextAction = buildMapCameraViewAction(
                            draft,
                            currentMapViewState
                        );
                        onApplyAction(
                            nextAction,
                            buildMapCameraApplyLabel(draft)
                        );
                    }}
                    style={{
                        ...buttonStyle,
                        background: "#0f766e",
                        border: "none",
                    }}
                >
                    Apply
                </button>
            </div>
        </Panel>
    );
}

function UiOptionToggleRow({
    optionValues,
    draft,
    onToggleOption,
}: {
    optionValues: UIOptionName[];
    draft: UiEffectsDraftState;
    onToggleOption: (option: UIOptionName) => void;
}) {
    return (
        <SimpleOptionToggleRow
            options={optionValues.map((option) => ({
                value: option,
                label: uiOptionChoices.find((item) => item.value === option)?.label || option,
                selected: draft.selected[option],
            }))}
            onToggleOption={onToggleOption}
        />
    );
}

function SimpleOptionToggleRow<T extends string>({
    options,
    onToggleOption,
}: {
    options: Array<{ value: T; label: string; selected: boolean }>;
    onToggleOption: (option: T) => void;
}) {
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 12px" }}>
            {options.map((option) => {
                const isSelected = option.selected;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onToggleOption(option.value)}
                        style={{
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: isSelected ? "#22c55e" : "#e5e7eb",
                            textDecorationLine: isSelected ? "none" : "line-through",
                            textDecorationThickness: isSelected ? undefined : "2px",
                            textDecorationColor: isSelected ? undefined : "rgba(148, 163, 184, 0.7)",
                            fontSize: 13,
                            fontWeight: isSelected ? 850 : 750,
                            whiteSpace: "nowrap",
                        }}
                        title={isSelected ? "Đang bật option này" : "Đang tắt option này"}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

function UiEffectsEditor({
    actions,
    wikiChoices,
    onApplyActions,
}: {
    actions: ReplayAction<UIOptionName>[];
    wikiChoices: Choice[];
    onApplyActions: (nextActions: ReplayAction<UIOptionName>[], label: string) => void;
}) {
    const [draft, setDraft] = useState<UiEffectsDraftState>(() => buildUiEffectsDraftState(actions));

    useEffect(() => {
        setDraft(buildUiEffectsDraftState(actions));
    }, [actions]);

    const handleApply = () => {
        const evaluatedOptions: UIOptionName[] = ["timeline", "layer_panel", "zoom_panel", "wiki"];
        const updatedDraft = {
            ...draft,
            selected: {
                ...draft.selected,
                wiki: Boolean(draft.wiki_id),
            },
        };

        const nextActions = replaceUiActionsByGroup(actions, evaluatedOptions, updatedDraft);
        const label = buildUiEffectsApplyLabel("UI Effects", updatedDraft, evaluatedOptions);
        onApplyActions(nextActions, label);
    };

    return (
        <Panel title="UI Effects" defaultOpen>
            <div style={{ display: "grid", gap: 12 }}>
                <UiOptionToggleRow
                    optionValues={uiSimpleOptionValues}
                    draft={draft}
                    onToggleOption={(option) =>
                        setDraft((prev) => ({
                            ...prev,
                            selected: {
                                ...prev.selected,
                                [option]: !prev.selected[option],
                            },
                        }))
                    }
                />

                <div style={{ borderTop: "1px solid #1f2937", margin: "8px 0" }} />

                <FieldInput
                    field={{ name: "wiki_id", label: "Mở Wiki", kind: "wiki" }}
                    value={draft.wiki_id}
                    geometryChoices={[]}
                    wikiChoices={wikiChoices}
                    onChange={(nextValue) =>
                        setDraft((prev) => ({
                            ...prev,
                            wiki_id: asString(nextValue),
                        }))
                    }
                />

                <button
                    type="button"
                    onClick={handleApply}
                    style={{
                        ...buttonStyle,
                        background: "#0f766e",
                        border: "none",
                    }}
                >
                    Apply
                </button>
            </div>
        </Panel>
    );
}

function ActionGroupEditor<T extends string>({
    title,
    groupLabel,
    actions,
    definitions,
    geometryChoices,
    wikiChoices,
    createOnSelect = false,
    emptyOptionLabel,
    onUpdateActions,
    onLinkClick,
}: {
    title: string;
    groupLabel: string;
    actions: ReplayAction<T>[];
    definitions: Record<T, ActionDefinition<T>>;
    geometryChoices: Choice[];
    wikiChoices: Choice[];
    createOnSelect?: boolean;
    emptyOptionLabel?: string;
    onUpdateActions: (nextActions: ReplayAction<T>[], label: string) => void;
    onLinkClick?: (quill: any) => void;
}) {
    const functionNames = useMemo(() => Object.keys(definitions) as T[], [definitions]);
    const [composerFunctionName, setComposerFunctionName] = useState<T | "">(
        createOnSelect && functionNames.length > 1 ? "" : (functionNames[0] as T)
    );
    const [composerDraftValues, setComposerDraftValues] = useState<ActionFormValues>(() =>
        buildActionComposerDraft(
            definitions,
            createOnSelect && functionNames.length > 1 ? "" : (functionNames[0] as T)
        )
    );

    const lastLoadedActionsRef = useRef<any>(null);

    useEffect(() => {
        if (JSON.stringify(actions) === JSON.stringify(lastLoadedActionsRef.current)) {
            return;
        }
        lastLoadedActionsRef.current = actions;

        if (actions.length > 0) {
            const first = actions[0];
            setComposerFunctionName(first.function_name);
            const def = definitions[first.function_name];
            if (def) {
                setComposerDraftValues(def.deserialize(first.params));
            }
        } else {
            const defaultFun = createOnSelect && functionNames.length > 1 ? "" : (functionNames[0] as T);
            setComposerFunctionName(defaultFun);
            setComposerDraftValues(buildActionComposerDraft(definitions, defaultFun));
        }
    }, [actions, definitions, createOnSelect, functionNames]);

    const composerDefinition = composerFunctionName
        ? definitions[composerFunctionName]
        : null;

    const handleComposerFunctionChange = (nextFunctionName: T | "") => {
        setComposerFunctionName(nextFunctionName);
        setComposerDraftValues(buildActionComposerDraft(definitions, nextFunctionName));
    };

    const handleApplyNewAction = () => {
        if (!composerFunctionName) return;
        const definition = definitions[composerFunctionName];
        if (!definition) return;

        onUpdateActions(
            [
                ...actions,
                {
                    function_name: composerFunctionName,
                    params: definition.serialize(composerDraftValues),
                },
            ],
            `${groupLabel}: thêm ${definition.label}`
        );

        if (createOnSelect && functionNames.length > 1) {
            setComposerFunctionName("");
            setComposerDraftValues(buildActionComposerDraft(definitions, ""));
            return;
        }

        setComposerDraftValues(buildActionComposerDraft(definitions, composerFunctionName));
    };

    return (
        <Panel title={title} badge={`${actions.length}`} defaultOpen>
            <div style={{ display: "grid", gap: 10 }}>
                {functionNames.length > 1 ? (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr",
                            gap: 8,
                            alignItems: "center",
                        }}
                    >
                        <select
                            value={composerFunctionName}
                            onChange={(event) => {
                                const nextValue = event.target.value as T | "";
                                handleComposerFunctionChange(nextValue);
                            }}
                            style={inputStyle}
                        >
                            {createOnSelect ? (
                                <option value="">{emptyOptionLabel || "Chọn option"}</option>
                            ) : null}
                            {functionNames.map((functionName) => (
                                <option key={functionName} value={functionName}>
                                    {definitions[functionName].label}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}

                {composerDefinition ? (
                    <div
                        style={{
                            padding: 10,
                            borderRadius: 8,
                            border: "1px solid #243244",
                            background: "#0f172a",
                            display: "grid",
                            gap: 10,
                        }}
                    >
                        <div style={{ fontSize: 12, color: "#93c5fd", fontWeight: 900 }}>
                            Tạo action mới: {composerDefinition.label}
                        </div>

                        {composerDefinition.fields.length === 0 ? (
                            <div style={{ fontSize: 12, color: "#94a3b8" }}>
                                Action này không cần tham số.
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 8 }}>
                                {composerDefinition.fields
                                    .filter((field) =>
                                        !field.visibleWhen || field.visibleWhen(composerDraftValues)
                                    )
                                    .map((field) => (
                                        <FieldInput
                                            key={`${composerFunctionName}-${field.name}`}
                                            field={field}
                                            value={composerDraftValues[field.name]}
                                            geometryChoices={geometryChoices}
                                            wikiChoices={wikiChoices}
                                            onLinkClick={onLinkClick}
                                            onChange={(nextValue) =>
                                                setComposerDraftValues((prev) => ({
                                                    ...prev,
                                                    [field.name]: nextValue,
                                                }))
                                            }
                                        />
                                    ))}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleApplyNewAction}
                            style={{
                                ...buttonStyle,
                                background: "#0f766e",
                                border: "none",
                            }}
                        >
                            Apply
                        </button>
                    </div>
                ) : null}

            </div>
        </Panel>
    );
}

function buildActionComposerDraft<T extends string>(
    definitions: Record<T, ActionDefinition<T>>,
    functionName: T | ""
): ActionFormValues {
    if (!functionName) return {};
    const definition = definitions[functionName];
    if (!definition) return {};
    return definition.deserialize(definition.create().params);
}

function FieldInput({
    field,
    value,
    geometryChoices,
    wikiChoices,
    onChange,
    onLinkClick,
}: {
    field: ActionFieldConfig;
    value: ActionValue | undefined;
    geometryChoices: Choice[];
    wikiChoices: Choice[];
    onChange: (nextValue: ActionValue) => void;
    onLinkClick?: (quill: any) => void;
}) {
    const baseLabel = (
        <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 700 }}>
            {field.label}
        </div>
    );

    if (field.kind === "rich-text") {
        return (
            <label style={{ display: "grid", gap: 6 }}>
                {baseLabel}
                <div style={{ background: "#0b1220", borderRadius: 6, border: "1px solid #334155" }} className="dark">
                    <ReactQuillEditor
                        theme="snow"
                        value={asString(value)}
                        onChange={(content: string) => onChange(content)}
                        modules={{
                            toolbar: {
                                container: [
                                    ["bold", "italic", "underline", "strike"],
                                    [{ list: "ordered" }, { list: "bullet" }],
                                    ["link"],
                                    ["clean"],
                                ],
                                handlers: {
                                    link: function (this: { quill?: any }) {
                                        onLinkClick?.(this?.quill);
                                    },
                                },
                            },
                        }}
                    />
                </div>
            </label>
        );
    }

    if (field.kind === "textarea") {
        return (
            <label style={{ display: "grid", gap: 6 }}>
                {baseLabel}
                <textarea
                    value={asString(value)}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    style={{
                        ...inputStyle,
                        resize: "vertical",
                        minHeight: 76,
                    }}
                />
            </label>
        );
    }

    if (field.kind === "boolean") {
        return (
            <label
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #334155",
                    background: "#0b1220",
                }}
            >
                <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => onChange(event.target.checked)}
                />
                <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 700 }}>{field.label}</span>
            </label>
        );
    }

    if (field.kind === "select") {
        return (
            <label style={{ display: "grid", gap: 6 }}>
                {baseLabel}
                <select
                    value={asString(value)}
                    onChange={(event) => onChange(event.target.value)}
                    style={inputStyle}
                >
                    {(field.options || []).map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </label>
        );
    }

    if (field.kind === "geometry") {
        return (
            <label style={{ display: "grid", gap: 6 }}>
                {baseLabel}
                <select
                    value={asString(value)}
                    onChange={(event) => onChange(event.target.value)}
                    style={inputStyle}
                >
                    <option value="">Chọn geometry</option>
                    {geometryChoices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                            {choice.label}
                        </option>
                    ))}
                </select>
            </label>
        );
    }

    if (field.kind === "wiki") {
        return (
            <label style={{ display: "grid", gap: 6 }}>
                {baseLabel}
                <select
                    value={asString(value)}
                    onChange={(event) => onChange(event.target.value)}
                    style={inputStyle}
                >
                    <option value="">Chọn wiki</option>
                    {wikiChoices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                            {choice.label}
                        </option>
                    ))}
                </select>
            </label>
        );
    }

    if (field.kind === "geometry-multi") {
        const selectedValues = toStringArray(value);
        return (
            <label style={{ display: "grid", gap: 6 }}>
                {baseLabel}
                <select
                    multiple
                    value={selectedValues}
                    onChange={(event) => {
                        const nextValues = Array.from(event.target.selectedOptions).map((option) => option.value);
                        onChange(nextValues);
                    }}
                    style={{
                        ...inputStyle,
                        minHeight: 96,
                    }}
                >
                    {geometryChoices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                            {choice.label}
                        </option>
                    ))}
                </select>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    Giữ Ctrl/Cmd để chọn nhiều geometry.
                </div>
            </label>
        );
    }

    return (
        <label style={{ display: "grid", gap: 6 }}>
            {baseLabel}
            <input
                value={asString(value)}
                type={field.kind === "number" ? "number" : field.kind === "color" ? "color" : "text"}
                onChange={(event) => onChange(event.target.value)}
                placeholder={field.placeholder}
                style={inputStyle}
            />
        </label>
    );
}

function asString(value: unknown) {
    return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toInputNumber(value: unknown, fallback: string) {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.trim().length) return value;
    return fallback;
}

function toOptionalNumber(value: unknown) {
    const raw = asString(value).trim();
    if (!raw.length) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function toNumberOr(value: unknown, fallback: number) {
    const parsed = toOptionalNumber(value);
    return parsed == null ? fallback : parsed;
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => asString(item).trim())
        .filter((item) => item.length > 0);
}

function emptyToNull(value: string) {
    return value.trim().length ? value : null;
}

function emptyToUndefined(value: string) {
    return value.trim().length ? value : undefined;
}

function compactTrailingUndefined(values: unknown[]) {
    const next = [...values];
    while (next.length > 0 && next[next.length - 1] === undefined) {
        next.pop();
    }
    return next;
}

function normalizeSelectValue(value: string, fallback: string) {
    return value.trim().length ? value : fallback;
}

function buildUiEffectsDraftState(actions: ReplayAction<UIOptionName>[]): UiEffectsDraftState {
    const selected = buildEmptyUiOptionSelection();
    const visible = buildDefaultUiVisibilityState();
    let wiki_id = "";
    let message = "";

    for (const action of actions) {
        const descriptor = getUiActionDescriptor(action);
        if (!descriptor) continue;

        switch (descriptor.option) {
            case "timeline":
            case "layer_panel":
            case "zoom_panel":
                selected[descriptor.option] = Boolean(descriptor.payload[0] ?? false);
                visible[descriptor.option] = Boolean(descriptor.payload[0] ?? false);
                break;
            case "wiki":
                selected[descriptor.option] = true;
                wiki_id = asString(descriptor.payload[0]);
                break;
            case "toast":
                selected[descriptor.option] = true;
                message = asString(descriptor.payload[0]);
                break;
            default:
                break;
        }
    }

    return {
        selected,
        visible,
        wiki_id,
        message,
    };
}

function buildEmptyUiOptionSelection(): Record<UIOptionName, boolean> {
    return {
        timeline: false,
        layer_panel: false,
        zoom_panel: false,
        wiki: false,
        toast: false,
    };
}

function buildDefaultUiVisibilityState(): Record<UiVisibleOptionName, boolean> {
    return {
        timeline: false,
        layer_panel: false,
        zoom_panel: false,
    };
}

function buildMapCameraDraftState(
    actions: ReplayAction<"set_camera_view">[]
): MapCameraDraftState {
    const state = actions[0]?.params[0];
    return {
        selected: {
            center: hasCameraCenter(state),
            zoom: hasFiniteNumber(getObjectValue(state, "zoom")),
            bearing: hasFiniteNumber(getObjectValue(state, "bearing")),
            pitch: hasFiniteNumber(getObjectValue(state, "pitch")),
        },
    };
}

function buildMapCameraViewAction(
    draft: MapCameraDraftState,
    mapViewState: CurrentMapViewState | null
): ReplayAction<"set_camera_view"> | null {
    const selectedOptions = mapCameraOptionChoices
        .map((choice) => choice.value)
        .filter((option) => draft.selected[option]);

    if (selectedOptions.length === 0) {
        return null;
    }
    if (!mapViewState) {
        return null;
    }

    const nextState: Record<string, unknown> = {};
    if (draft.selected.center) {
        nextState.center = [mapViewState.center.lng, mapViewState.center.lat];
    }
    if (draft.selected.zoom) {
        nextState.zoom = mapViewState.zoom;
    }
    if (draft.selected.bearing) {
        nextState.bearing = mapViewState.bearing;
    }
    if (draft.selected.pitch) {
        nextState.pitch = mapViewState.pitch;
    }

    return {
        function_name: "set_camera_view",
        params: [nextState],
    };
}

function buildMapCameraApplyLabel(draft: MapCameraDraftState) {
    const activeLabels = mapCameraOptionChoices
        .filter((choice) => draft.selected[choice.value])
        .map((choice) => choice.label);

    return activeLabels.length > 0
        ? `Map Camera View: apply ${activeLabels.join(", ")}`
        : "Map Camera View: clear";
}

function mergeMapActions(
    cameraActions: ReplayAction<"set_camera_view">[],
    quickActions: ReplayAction<MapFunctionName>[]
): ReplayAction<MapFunctionName>[] {
    return [...cameraActions, ...quickActions];
}

function replaceUiActionsByGroup(
    actions: ReplayAction<UIOptionName>[],
    groupOptions: UIOptionName[],
    draft: UiEffectsDraftState
) {
    const preserved = actions.filter((action) => {
        const legacyAction = action as { function_name: unknown; params: unknown[] };
        if (legacyAction.function_name === "UI" && legacyAction.params[0] === "all") return false;
        const descriptor = getUiActionDescriptor(legacyAction);
        if (!descriptor) return true;
        return !groupOptions.includes(descriptor.option);
    });

    const nextGroupActions = groupOptions
        .filter((option) => {
            if (option === "timeline" || option === "layer_panel" || option === "zoom_panel") {
                return true;
            }
            return draft.selected[option];
        })
        .map((option) => buildUiOptionAction(option, draft));

    return [...preserved, ...nextGroupActions];
}

function buildUiEffectsApplyLabel(
    prefix: string,
    draft: UiEffectsDraftState,
    groupOptions: UIOptionName[]
) {
    const activeLabels = groupOptions
        .filter((option) => {
            if (option === "timeline" || option === "layer_panel" || option === "zoom_panel") {
                return true;
            }
            return draft.selected[option];
        })
        .map((option) => {
            const label = uiOptionChoices.find((choice) => choice.value === option)?.label || option;
            if (option === "timeline" || option === "layer_panel" || option === "zoom_panel") {
                return draft.selected[option] ? `Show ${label}` : `Hide ${label}`;
            }
            return label;
        });

    return activeLabels.length > 0
        ? `${prefix}: ${activeLabels.join(", ")}`
        : `${prefix}: clear`;
}

function buildUiOptionAction(
    option: UIOptionName,
    draft: UiEffectsDraftState
): ReplayAction<UIOptionName> {
    switch (option) {
        case "timeline":
        case "layer_panel":
        case "zoom_panel":
            return {
                function_name: option,
                params: [draft.selected[option]],
            };
        case "wiki":
            return {
                function_name: option,
                params: [draft.wiki_id || null],
            };
        case "toast":
            return {
                function_name: option,
                params: [draft.message],
            };
    }
}

function getUiActionDescriptor(action: {
    function_name: unknown;
    params: unknown[];
}) {
    const params = Array.isArray(action.params) ? action.params : [];

    if (action.function_name === "UI") {
        const option = normalizeUiOptionValue(params[0]);
        if (!option) return null;
        return {
            option,
            payload: params.slice(1),
        };
    }

    const option = normalizeUiOptionValue(action.function_name);
    if (!option) return null;
    return {
        option,
        payload: params,
    };
}

function normalizeUiOptionValue(value: unknown): UIOptionName | null {
    switch (value) {
        case "timeline":
        case "layer_panel":
        case "zoom_panel":
        case "wiki":
        case "toast":
            return value;
        case "wiki_panel":
        case "close_wiki_panel":
            return "wiki";
        default:
            return null;
    }
}

function getObjectValue(value: unknown, key: string) {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
}

function hasFiniteNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value);
}

function hasCameraCenter(value: unknown) {
    const center = getObjectValue(value, "center");
    if (Array.isArray(center) && center.length >= 2) {
        return hasFiniteNumber(center[0]) && hasFiniteNumber(center[1]);
    }
    if (!center || typeof center !== "object") return false;
    return hasFiniteNumber((center as { lng?: unknown }).lng) && hasFiniteNumber((center as { lat?: unknown }).lat);
}
