import { Panel } from "./Panel";

type Commit = {
    id: string;
    created_at?: string;
    edit_summary: string;
    user_id: string;
};

type CommitHistoryPanelProps = {
    commits: Commit[];
    headCommitId: string | null;
    onRestoreCommit: (commitId: string) => void;
    isSaving: boolean;
    isSubmitting: boolean;
};

export function CommitHistoryPanel({
    commits,
    headCommitId,
    onRestoreCommit,
    isSaving,
    isSubmitting,
}: CommitHistoryPanelProps) {
    const formatCommitTitle = (commit: Commit) =>
        commit.edit_summary?.trim() || `Commit ${commit.id.slice(0, 8)}`;

    return (
        <Panel title="Commit History" badge={String(commits.length)} defaultOpen={false}>
            {commits.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 12 }}>Chưa có commit</div>
            ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12 }}>
                    {commits.slice(0, 8).map((commit) => {
                        const isHead = Boolean(headCommitId && commit.id === headCommitId);
                        return (
                            <li
                                key={commit.id}
                                style={{
                                    padding: "8px 0",
                                    borderBottom: "1px solid #1f2937",
                                    color: "#e2e8f0",
                                    display: "flex",
                                    flexDirection: "row"
                                }}
                            >
                                <div style={{flex:1}}>
                                    <div
                                        title={formatCommitTitle(commit)}
                                        style={{
                                            fontWeight: 750,
                                            color: "#f8fafc",
                                            overflowWrap: "anywhere",
                                        }}
                                    >
                                        {formatCommitTitle(commit)}
                                    </div>
                                    <div style={{ marginTop: 3, color: "#94a3b8" }}>
                                        {commit.created_at ? new Date(commit.created_at).toLocaleString() : ""}
                                    </div>
                                </div>

                                <button
                                    style={{
                                        marginTop: 6,
                                        padding: "6px 8px",
                                        borderRadius: 6,
                                        border: "1px solid #334155",
                                        background: isHead ? "#0b1220" : "#334155",
                                        color: "white",
                                        cursor: isSaving || isSubmitting || isHead ? "not-allowed" : "pointer",
                                        opacity: isHead ? 0.65 : 1,
                                        fontWeight: 800,
                                        fontSize: 12,
                                    }}
                                    onClick={() => onRestoreCommit(commit.id)}
                                    disabled={isSaving || isSubmitting || isHead}
                                    title={isHead ? "Đang là head commit" : "Restore snapshot từ commit này (FE-only)"}
                                >
                                    Restore
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}
