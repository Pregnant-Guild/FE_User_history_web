"use client";

import { useState } from "react";
import type { UndoAction } from "@/uhm/lib/editor/state/useEditorState";
import type { EditorMode } from "@/uhm/lib/editor/session/sessionTypes";

import { ProjectPanel } from "./editor/ProjectPanel";
import { ToolsPanel } from "./editor/ToolsPanel";
import { CommitPanel } from "./editor/CommitPanel";
import { CommitHistoryPanel } from "./editor/CommitHistoryPanel";
import { UndoListPanel } from "./editor/UndoListPanel";
import { SubmitModal } from "./editor/SubmitModal";

type Props = {
    mode: EditorMode;
    setMode: (mode: EditorMode) => void;
    entityStatus?: string | null;
    onUndo: () => void;
    onCommit: () => void;
    onSubmit: (content: string) => void;
    onRestoreCommit: (commitId: string) => void;
    isSaving: boolean;
    isSubmitting: boolean;
    sectionTitle: string;
    projectStatus: string;
    commitTitle: string;
    onCommitTitleChange: (title: string) => void;
    commitCount: number;
    hasHeadCommit: boolean;
    headCommitId: string | null;
    latestCommitLabel: string | null;
    commits: Array<{
        id: string;
        created_at?: string;
        edit_summary: string;
        user_id: string;
    }>;
    changesCount: number;
    undoStack: UndoAction[];
    width?: number;
};

export default function Editor({
    mode,
    setMode,
    entityStatus,
    onUndo,
    onCommit,
    onSubmit,
    onRestoreCommit,
    isSaving,
    isSubmitting,
    sectionTitle,
    projectStatus,
    commitTitle,
    onCommitTitleChange,
    commitCount,
    hasHeadCommit,
    headCommitId,
    latestCommitLabel,
    commits,
    changesCount,
    undoStack,
    width = 280,
}: Props) {
    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
    const [submitContent, setSubmitContent] = useState("");

    const handleOpenSubmitModal = () => {
        setSubmitContent("");
        setIsSubmitModalOpen(true);
    };

    const handleConfirmSubmit = () => {
        setIsSubmitModalOpen(false);
        onSubmit(submitContent);
    };

    const handleCancelSubmit = () => {
        setIsSubmitModalOpen(false);
    };

    return (
        <div
            style={{
                width,
                height: "100vh",
                overflowY: "auto",
                background: "#0b1220",
                color: "white",
                padding: "12px 12px 20px",
                borderRight: "1px solid #1f2937",
            }}
        >
            <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#0b1220", paddingBottom: 10 }}>

                <ProjectPanel
                    sectionTitle={sectionTitle}
                    projectStatus={projectStatus}
                    commitCount={commitCount}
                    latestCommitLabel={latestCommitLabel}
                />

                <ToolsPanel
                    mode={mode}
                    setMode={setMode}
                    onUndo={onUndo}
                />

                {entityStatus ? (
                    <div
                        style={{
                            marginTop: 10,
                            padding: "10px",
                            background: "#111827",
                            borderRadius: 8,
                            border: "1px solid #7f1d1d",
                            color: "#fecaca",
                            fontSize: 12,
                            overflowWrap: "anywhere",
                        }}
                    >
                        {entityStatus}
                    </div>
                ) : null}
            </div>

            <CommitPanel
                commitTitle={commitTitle}
                onCommitTitleChange={onCommitTitleChange}
                isSaving={isSaving}
                isSubmitting={isSubmitting}
                changesCount={changesCount}
                onCommit={onCommit}
                hasHeadCommit={hasHeadCommit}
                handleOpenSubmitModal={handleOpenSubmitModal}
            />

            <CommitHistoryPanel
                commits={commits}
                headCommitId={headCommitId}
                onRestoreCommit={onRestoreCommit}
                isSaving={isSaving}
                isSubmitting={isSubmitting}
            />

            <UndoListPanel undoStack={undoStack} />

            <SubmitModal
                isSubmitModalOpen={isSubmitModalOpen}
                submitContent={submitContent}
                setSubmitContent={setSubmitContent}
                handleCancelSubmit={handleCancelSubmit}
                handleConfirmSubmit={handleConfirmSubmit}
            />
        </div>
    );
}
