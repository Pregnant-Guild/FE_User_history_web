"use client";

import { useEffect, useMemo, useState } from "react";
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
        label: "Dialog box",
        fields: [
            { name: "clear", label: "Ẩn dialog (Clear)", kind: "boolean" },
            { name: "avatar", label: "Avatar URL", kind: "text", placeholder: "https://... (avatar)" },
            { name: "text", label: "Nội dung", kind: "textarea", placeholder: "Lời thoại / Dẫn chuyện" },
            { name: "image_url", label: "Ảnh tư liệu", kind: "text", placeholder: "https://... (ảnh đè)" },
            { name: "image_caption", label: "Chú thích ảnh", kind: "text", placeholder: "Chú thích ảnh" },
        ],
        create: () => ({ function_name: "set_dialog", params: [{ avatar: "", text: "", image_url: "", image_caption: "" }] }),
        deserialize: (params) => {
            const data: any = params[0];
            if (data === null) {
                return {
                    clear: true,
                    avatar: "",
                    text: "",
                    image_url: "",
                    image_caption: "",
                };
            }
            return {
                clear: false,
                avatar: asString(data?.avatar),
                text: asString(data?.text),
                image_url: asString(data?.image_url),
                image_caption: asString(data?.image_caption),
            };
        },
        serialize: (values) => {
            if (values.clear) {
                return [null];
            }
            const data: any = {
                avatar: asString(values.avatar),
                text: asString(values.text),
            };
            if (values.image_url) {
                data.image_url = asString(values.image_url);
            }
            if (values.image_caption) {
                data.image_caption = asString(values.image_caption);
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

function UiSimpleEffectsPanel({
    draft,
    onToggleOption,
    onApply,
}: {
    draft: UiEffectsDraftState;
    onToggleOption: (option: UIOptionName) => void;
    onApply: () => void;
}) {
    const activeCount = uiSimpleOptionValues.filter((option) => draft.selected[option]).length;

    return (
        <Panel title="UI Effects" badge={`${activeCount}`} defaultOpen>
            <div style={{ display: "grid", gap: 12 }}>
                <UiOptionToggleRow
                    optionValues={uiSimpleOptionValues}
                    draft={draft}
                    onToggleOption={onToggleOption}
                />
                <button
                    type="button"
                    onClick={onApply}
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

function UiInputEffectsPanel({
    draft,
    wikiChoices,
    onToggleOption,
    onChangeDraft,
    onApply,
}: {
    draft: UiEffectsDraftState;
    wikiChoices: Choice[];
    onToggleOption: (option: UIOptionName) => void;
    onChangeDraft: (patch: Partial<UiEffectsDraftState>) => void;
    onApply: () => void;
}) {
    const activeCount = uiInputOptionValues.filter((option) => draft.selected[option]).length;

    return (
        <Panel title="UI Input Effects" badge={`${activeCount}`} defaultOpen>
            <div style={{ display: "grid", gap: 12 }}>
                <UiOptionToggleRow
                    optionValues={uiInputOptionValues}
                    draft={draft}
                    onToggleOption={onToggleOption}
                />

                {draft.selected.wiki ? (
                    <FieldInput
                        field={{ name: "wiki_id", label: "Wiki", kind: "wiki" }}
                        value={draft.wiki_id}
                        geometryChoices={[]}
                        wikiChoices={wikiChoices}
                        onChange={(nextValue) => onChangeDraft({ wiki_id: asString(nextValue) })}
                    />
                ) : null}

                {draft.selected.toast ? (
                    <FieldInput
                        field={{
                            name: "message",
                            label: "Message",
                            kind: "textarea",
                            placeholder: "Nội dung thông báo",
                        }}
                        value={draft.message}
                        geometryChoices={[]}
                        wikiChoices={wikiChoices}
                        onChange={(nextValue) => onChangeDraft({ message: asString(nextValue) })}
                    />
                ) : null}

                <button
                    type="button"
                    onClick={onApply}
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

// UiVisibilityOptions removed since toggles are evaluated directly

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

    return (
        <>
            <UiSimpleEffectsPanel
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
                onApply={() =>
                    onApplyActions(
                        replaceUiActionsByGroup(actions, uiSimpleOptionValues, draft),
                        buildUiEffectsApplyLabel("UI Effects", draft, uiSimpleOptionValues)
                    )
                }
            />
            <UiInputEffectsPanel
                draft={draft}
                wikiChoices={wikiChoices}
                onToggleOption={(option) =>
                    setDraft((prev) => ({
                        ...prev,
                        selected: {
                            ...prev.selected,
                            [option]: !prev.selected[option],
                        },
                    }))
                }
                onChangeDraft={(patch) =>
                    setDraft((prev) => ({
                        ...prev,
                        ...patch,
                    }))
                }
                onApply={() =>
                    onApplyActions(
                        replaceUiActionsByGroup(actions, uiInputOptionValues, draft),
                        buildUiEffectsApplyLabel("UI Inputs", draft, uiInputOptionValues)
                    )
                }
            />
        </>
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
}: {
    field: ActionFieldConfig;
    value: ActionValue | undefined;
    geometryChoices: Choice[];
    wikiChoices: Choice[];
    onChange: (nextValue: ActionValue) => void;
}) {
    const baseLabel = (
        <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 700 }}>
            {field.label}
        </div>
    );

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
