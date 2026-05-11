import { Panel } from "./Panel";

type ProjectPanelProps = {
    sectionTitle: string;
    projectStatus: string;
    commitCount: number;
    latestCommitLabel: string | null;
};

export function ProjectPanel({
    sectionTitle,
    projectStatus,
    commitCount,
    latestCommitLabel,
}: ProjectPanelProps) {
    return (
        <Panel title="Project" defaultOpen>
            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>
                <div style={{ color: "white", fontWeight: 850, overflowWrap: "anywhere" }}>{sectionTitle}</div>
                <div style={{ marginTop: 6 }}>
                    Status: <span style={{ color: "#e2e8f0" }}>{projectStatus}</span>
                </div>
                <div style={{ marginTop: 6 }}>
                    Commits: <span style={{ color: "#e2e8f0" }}>{commitCount}</span>
                </div>
                <div style={{ marginTop: 6 }}>
                    {latestCommitLabel ? (
                        <span style={{ color: "#e2e8f0" }}>{latestCommitLabel}</span>
                    ) : (
                        <span style={{ color: "#94a3b8" }}>Chưa có head commit</span>
                    )}
                </div>
            </div>
        </Panel>
    );
}
