"use client";

import { useEffect, useMemo, type ComponentProps } from "react";
import Tree from "react-d3-tree";

export type CommitTreeItem = {
    id: string;
    parent_commit_id: string | null;
    restored_from_commit_id: string | null;
    commit_no: number;
    kind: string;
    created_by: string;
    created_at: string;
    title: string | null;
};

type CommitTreeNode = {
    commit: CommitTreeItem;
    children: CommitTreeNode[];
};

type CommitTreeDatum = {
    name: string;
    commit: CommitTreeItem;
    isHead: boolean;
    detail: string;
    restoredFromLabel: string | null;
    children?: CommitTreeDatum[];
};

type Props = {
    open: boolean;
    commits: CommitTreeItem[];
    headCommitId: string | null;
    onClose: () => void;
};

type TreeRenderNode = NonNullable<ComponentProps<typeof Tree>["renderCustomNodeElement"]>;

export default function CommitTreePopup({
                                            open,
                                            commits,
                                            headCommitId,
                                            onClose,
                                        }: Props) {
    const { roots, commitById } = useMemo(() => buildCommitTree(commits), [commits]);
    const treeData = useMemo(
        () => roots.map((node) => toTreeDatum(node, commitById, headCommitId)),
        [roots, commitById, headCommitId]
    );

    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            role="presentation"
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                background: "rgba(2, 6, 23, 0.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-label="Commit tree"
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: "min(1120px, calc(100vw - 48px))",
                    maxHeight: "min(720px, calc(100vh - 48px))",
                    overflow: "hidden",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    background: "#0f172a",
                    color: "#e2e8f0",
                    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <style>
                    {`
                        .commit-tree-link {
                            fill: none;
                            stroke: #ffffff;
                            stroke-width: 4px;
                            stroke-opacity: 1;
                            filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.75));
                        }
                    `}
                </style>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        padding: "14px 16px",
                        borderBottom: "1px solid #1f2937",
                    }}
                >
                    <div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                            Commit tree
                        </div>
                        <div style={{ marginTop: "3px", fontSize: "12px", color: "#94a3b8" }}>
                            {commits.length} commit{commits.length === 1 ? "" : "s"}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: "7px 10px",
                            border: "1px solid #475569",
                            borderRadius: "4px",
                            background: "#111827",
                            color: "#f8fafc",
                            cursor: "pointer",
                        }}
                    >
                        Close
                    </button>
                </div>

                <div
                    style={{
                        padding: "16px",
                        overflow: "auto",
                    }}
                >
                    {treeData.length === 0 ? (
                        <div style={{ color: "#94a3b8", fontSize: "14px" }}>
                            Chưa có commit.
                        </div>
                    ) : (
                        <div
                            style={{
                                width: "100%",
                                minWidth: "640px",
                                height: "540px",
                                border: "1px solid #64748b",
                                borderRadius: "6px",
                                background: "#111827",
                                overflow: "hidden",
                            }}
                        >
                            <Tree
                                data={treeData}
                                orientation="vertical"
                                translate={{ x: 520, y: 56 }}
                                nodeSize={{ x: 300, y: 165 }}
                                separation={{ siblings: 1.15, nonSiblings: 1.45 }}
                                pathFunc="step"
                                collapsible={false}
                                zoomable
                                draggable
                                scaleExtent={{ min: 0.45, max: 1.4 }}
                                renderCustomNodeElement={renderCommitTreeNode}
                                pathClassFunc={() => "commit-tree-link"}
                            />
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

const renderCommitTreeNode: TreeRenderNode = function renderCommitTreeNode({ nodeDatum }) {
    const datum = nodeDatum as unknown as CommitTreeDatum;
    const commit = datum.commit;
    const isHead = datum.isHead;

    return (
        <g>
            <circle
                r={8}
                fill={isHead ? "#16a34a" : "#111827"}
                stroke={isHead ? "#bbf7d0" : "#f8fafc"}
                strokeWidth={3}
            />
            <foreignObject x={-115} y={18} width={230} height={96}>
                <div
                    style={{
                        width: "220px",
                        minHeight: "78px",
                        padding: "8px 9px",
                        border: isHead ? "2px solid #86efac" : "2px solid #e2e8f0",
                        borderRadius: "6px",
                        background: isHead ? "#14532d" : "#1f2937",
                        color: "#f8fafc",
                        fontSize: "12px",
                        lineHeight: 1.35,
                        boxSizing: "border-box",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            minWidth: 0,
                        }}
                    >
                        <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                            #{commit.commit_no}
                        </span>
                        {isHead ? (
                            <span
                                style={{
                                    padding: "1px 5px",
                                    border: "1px solid #22c55e",
                                    borderRadius: "4px",
                                    color: "#bbf7d0",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                }}
                            >
                                HEAD
                            </span>
                        ) : null}
                    </div>
                    <div
                        title={formatCommitTitle(commit)}
                        style={{
                            marginTop: "4px",
                            color: "#f8fafc",
                            fontWeight: 700,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {formatCommitTitle(commit)}
                    </div>
                    <div style={{ marginTop: "4px", color: "#94a3b8" }}>
                        {datum.detail}
                    </div>
                    {datum.restoredFromLabel ? (
                        <div
                            title={datum.restoredFromLabel}
                            style={{
                                marginTop: "3px",
                                color: "#93c5fd",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {datum.restoredFromLabel}
                        </div>
                    ) : null}
                </div>
            </foreignObject>
        </g>
    );
};

function buildCommitTree(commits: CommitTreeItem[]) {
    const commitById = new Map<string, CommitTreeItem>();
    const nodeById = new Map<string, CommitTreeNode>();

    for (const commit of commits) {
        commitById.set(commit.id, commit);
        nodeById.set(commit.id, { commit, children: [] });
    }

    const roots: CommitTreeNode[] = [];
    for (const node of nodeById.values()) {
        const parentId = getDisplayParentCommitId(node.commit);
        const parent = parentId ? nodeById.get(parentId) : null;
        if (parent) {
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    }

    const sortNodes = (nodes: CommitTreeNode[]) => {
        nodes.sort((a, b) => a.commit.commit_no - b.commit.commit_no);
        for (const node of nodes) {
            sortNodes(node.children);
        }
    };
    sortNodes(roots);

    return { roots, commitById };
}

function toTreeDatum(
    node: CommitTreeNode,
    commitById: Map<string, CommitTreeItem>,
    headCommitId: string | null
): CommitTreeDatum {
    const commit = node.commit;
    const restoredFromCommit = commit.restored_from_commit_id
        ? commitById.get(commit.restored_from_commit_id) || null
        : null;
    const children = node.children.map((child) => toTreeDatum(child, commitById, headCommitId));

    return {
        name: formatCommitTitle(commit),
        commit,
        isHead: headCommitId === commit.id,
        detail: `${commit.kind} by ${commit.created_by} - ${formatDateTime(commit.created_at)}`,
        restoredFromLabel: restoredFromCommit
            ? `restored from #${restoredFromCommit.commit_no} ${formatCommitTitle(restoredFromCommit)}`
            : null,
        children: children.length ? children : undefined,
    };
}

function getDisplayParentCommitId(commit: CommitTreeItem): string | null {
    if (commit.kind === "restore" && commit.restored_from_commit_id) {
        return commit.restored_from_commit_id;
    }
    return commit.parent_commit_id;
}

function formatCommitTitle(commit: CommitTreeItem): string {
    return commit.title?.trim() || `Commit #${commit.commit_no}`;
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}
