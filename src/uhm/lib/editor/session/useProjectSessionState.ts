import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EditorSnapshot, Project, ProjectCommit, ProjectState } from "@/uhm/types/projects";

type Options = {
    defaultEditorUserId: string;
};

type SectionTask = "idle" | "saving" | "submitting" | "opening-project";

export function useProjectSessionState(options: Options) {
    // Single state machine cho các tác vụ async của project (saving/submitting/opening).
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
    const isOpeningSection = sectionTask === "opening-project";
    const setIsSaving: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
        setTaskFlag("saving", next);
    }, [setTaskFlag]);
    const setIsSubmitting: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
        setTaskFlag("submitting", next);
    }, [setTaskFlag]);
    const setIsOpeningSection: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
        setTaskFlag("opening-project", next);
    }, [setTaskFlag]);

    // Danh sách projects để user chọn mở.
    const [availableSections, setAvailableSections] = useState<Project[]>([]);
    // Project ID đang được chọn trong dropdown.
    const [selectedProjectId, setSelectedProjectId] = useState("");
    // Title project mới (để create).
    const [newSectionTitle, setNewSectionTitle] = useState("");
    // Input title cho commit.
    const [commitTitle, setCommitTitle] = useState("");
    // User ID dùng để gắn vào commit/submit/lock.
    const [editorUserIdInput, setEditorUserIdInput] = useState(options.defaultEditorUserId);
    // Project đang mở để edit (null nếu chưa mở).
    const [activeSection, setActiveSection] = useState<Project | null>(null);
    // Trạng thái project (version/head/status/lock).
    const [projectState, setProjectState] = useState<ProjectState | null>(null);
    // Danh sách commits của project đang mở.
    const [sectionCommits, setProjectCommits] = useState<ProjectCommit[]>([]);
    // Baseline snapshot currently loaded for this editor session.
    const [baselineSnapshot, setBaselineSnapshot] = useState<EditorSnapshot | null>(null);

    return {
        isSaving,
        setIsSaving,
        isSubmitting,
        setIsSubmitting,
        isOpeningSection,
        setIsOpeningSection,
        availableSections,
        setAvailableSections,
        selectedProjectId,
        setSelectedProjectId,
        newSectionTitle,
        setNewSectionTitle,
        commitTitle,
        setCommitTitle,
        editorUserIdInput,
        setEditorUserIdInput,
        activeSection,
        setActiveSection,
        projectState,
        setProjectState,
        sectionCommits,
        setProjectCommits,
        baselineSnapshot,
        setBaselineSnapshot,
    };
}
