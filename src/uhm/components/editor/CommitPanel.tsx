import { Panel } from "./Panel";

type CommitPanelProps = {
    commitTitle: string;
    onCommitTitleChange: (title: string) => void;
    isSaving: boolean;
    isSubmitting: boolean;
    changesCount: number;
    onCommit: () => void;
    hasHeadCommit: boolean;
    handleOpenSubmitModal: () => void;
};

export function CommitPanel({
    commitTitle,
    onCommitTitleChange,
    isSaving,
    isSubmitting,
    changesCount,
    onCommit,
    hasHeadCommit,
    handleOpenSubmitModal,
}: CommitPanelProps) {
    const primaryButtonStyle = {
        width: "100%",
        padding: "8px 10px",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        fontWeight: 850,
        fontSize: 12,
    } as const;

    const textInputStyle = {
        width: "100%",
        marginTop: 0,
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid #334155",
        background: "#0b1220",
        color: "white",
        boxSizing: "border-box",
        fontSize: 13,
        outline: "none",
    } as const;

    return (
        <Panel title="Commit" defaultOpen>
            <input
                value={commitTitle}
                onChange={(event) => onCommitTitleChange(event.target.value)}
                placeholder="Edit Summary (Commit Title)"
                disabled={isSaving || isSubmitting}
                style={textInputStyle}
            />
            <button
                style={{
                    ...primaryButtonStyle,
                    marginTop: 8,
                    background: isSaving || isSubmitting || changesCount <= 0 ? "#475569" : "#0f766e",
                    cursor: isSaving || isSubmitting || changesCount <= 0 ? "not-allowed" : "pointer",
                    opacity: changesCount <= 0 ? 0.75 : 1,
                }}
                onClick={onCommit}
                disabled={isSaving || isSubmitting || changesCount <= 0}
                title={changesCount <= 0 ? "Khong co thay doi de commit" : undefined}
            >
                Commit ({changesCount})
            </button>
            <button
                style={{
                    ...primaryButtonStyle,
                    marginTop: 8,
                    background: isSubmitting || !hasHeadCommit ? "#475569" : "#16a34a",
                    cursor: isSubmitting || !hasHeadCommit ? "not-allowed" : "pointer",
                    opacity: !hasHeadCommit ? 0.6 : 1,
                }}
                onClick={handleOpenSubmitModal}
                disabled={isSubmitting || !hasHeadCommit}
            >
                Submit
            </button>
        </Panel>
    );
}
