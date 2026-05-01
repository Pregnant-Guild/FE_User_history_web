import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EditorSnapshot, Section, SectionCommit, SectionState } from "@/uhm/types/sections";

type Options = {
    defaultEditorUserId: string;
};

type SectionTask = "idle" | "saving" | "submitting" | "opening-section";

export function useSectionSessionState(options: Options) {
    // Single state machine cho các tác vụ async của section (saving/submitting/opening).
    const [sectionTask, setSectionTask] = useState<SectionTask>("idle");
    const setTaskFlag = useCallback((task: Exclude<SectionTask, "idle">, next: SetStateAction<boolean>) => {
        setSectionTask((prev) => {
            const currentValue = prev === task;
            const nextValue = typeof next === "function" ? next(currentValue) : next;
            if (nextValue) return task;
            return prev === task ? "idle" : prev;
        });
    }, []);

    const isSaving = sectionTask === "saving";
    const isSubmitting = sectionTask === "submitting";
    const isOpeningSection = sectionTask === "opening-section";
    const setIsSaving: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
        setTaskFlag("saving", next);
    }, [setTaskFlag]);
    const setIsSubmitting: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
        setTaskFlag("submitting", next);
    }, [setTaskFlag]);
    const setIsOpeningSection: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
        setTaskFlag("opening-section", next);
    }, [setTaskFlag]);

    // Danh sách sections để user chọn mở.
    const [availableSections, setAvailableSections] = useState<Section[]>([]);
    // Section ID đang được chọn trong dropdown.
    const [selectedSectionId, setSelectedSectionId] = useState("");
    // Title section mới (để create).
    const [newSectionTitle, setNewSectionTitle] = useState("");
    // Input title cho commit.
    const [commitTitle, setCommitTitle] = useState("");
    // Input note cho commit.
    const [commitNote, setCommitNote] = useState("");
    // User ID dùng để gắn vào commit/submit/lock.
    const [editorUserIdInput, setEditorUserIdInput] = useState(options.defaultEditorUserId);
    // Section đang mở để edit (null nếu chưa mở).
    const [activeSection, setActiveSection] = useState<Section | null>(null);
    // Trạng thái section (version/head/status/lock).
    const [sectionState, setSectionState] = useState<SectionState | null>(null);
    // Danh sách commits của section đang mở.
    const [sectionCommits, setSectionCommits] = useState<SectionCommit[]>([]);
    // Snapshot gần nhất đã load (để build snapshot diff/metadata).
    const [lastSectionSnapshot, setLastSectionSnapshot] = useState<EditorSnapshot | null>(null);

    return {
        isSaving,
        setIsSaving,
        isSubmitting,
        setIsSubmitting,
        isOpeningSection,
        setIsOpeningSection,
        availableSections,
        setAvailableSections,
        selectedSectionId,
        setSelectedSectionId,
        newSectionTitle,
        setNewSectionTitle,
        commitTitle,
        setCommitTitle,
        commitNote,
        setCommitNote,
        editorUserIdInput,
        setEditorUserIdInput,
        activeSection,
        setActiveSection,
        sectionState,
        setSectionState,
        sectionCommits,
        setSectionCommits,
        lastSectionSnapshot,
        setLastSectionSnapshot,
    };
}
