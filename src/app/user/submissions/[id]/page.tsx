"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";

import Map from "@/uhm/components/Map";
import { DEFAULT_BACKGROUND_LAYER_VISIBILITY } from "@/uhm/lib/backgroundLayers";
import { EMPTY_FEATURE_COLLECTION } from "@/uhm/lib/geo/constants";
import { fetchSectionCommits } from "@/uhm/api/sections";
import { normalizeEditorSnapshot } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import type { EditorSnapshot, SectionCommit } from "@/uhm/types/sections";
import type { EntitySnapshot } from "@/uhm/types/entities";

import type { Submission } from "@/interface/submission";
import { apiGetSubmissionById } from "@/service/submissionService";
import type { Project } from "@/interface/project";
import { apiGetProjectDetail } from "@/service/projectService";

function formatTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("vi-VN");
}

export default function SubmissionDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [row, setRow] = useState<Submission | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [commits, setCommits] = useState<SectionCommit[]>([]);
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [snapshotEntities, setSnapshotEntities] = useState<EntitySnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExtras, setIsLoadingExtras] = useState(false);

  const headCommitSnapshotJson = useMemo(() => {
    const headId = project?.latest_commit_id || null;
    if (!headId) return null;
    const head = commits.find((c) => c.id === headId) || null;
    return (head as any)?.snapshot_json ?? null;
  }, [commits, project?.latest_commit_id]);

  const draft = useMemo(
    () => snapshot?.editor_feature_collection || EMPTY_FEATURE_COLLECTION,
    [snapshot]
  );

  useEffect(() => {
    let disposed = false;
    async function load() {
      if (!id) return;
      try {
        setIsLoading(true);
        const res = await apiGetSubmissionById(id);
        if (!disposed) setRow(res?.data || null);
      } catch (err) {
        console.error(err);
        toast.error("Khong the tai submission.");
      } finally {
        if (!disposed) setIsLoading(false);
      }
    }
    load();
    return () => {
      disposed = true;
    };
  }, [id]);

  useEffect(() => {
    let disposed = false;
    async function loadExtras() {
      if (!row?.project_id) return;
      try {
        setIsLoadingExtras(true);

        const [projectRes, commitRows] = await Promise.all([
          apiGetProjectDetail(row.project_id),
          fetchSectionCommits(row.project_id),
        ]);

        if (disposed) return;
        setProject(projectRes?.data || null);
        setCommits(commitRows || []);

        const commit = (commitRows || []).find((c) => c.id === row.commit_id) || null;
        const snap = normalizeEditorSnapshot(commit?.snapshot_json || null);
        setSnapshot(snap);
        setSnapshotEntities((snap?.entities || []) as EntitySnapshot[]);
      } catch (err) {
        console.error(err);
        toast.error("Khong the tai thong tin project/commit.");
      } finally {
        if (!disposed) setIsLoadingExtras(false);
      }
    }
    loadExtras();
    return () => {
      disposed = true;
    };
  }, [row?.commit_id, row?.project_id]);

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <PageBreadcrumb
        pageTitle="Chi tiet submission"
        paths={[{ name: "Kiem duyet submissions", href: "/user/submissions" }]}
      />

      <div className="mt-6">
        <ComponentCard title="Thong tin">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Dang tai...</div>
          ) : row ? (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">ID</div>
                <div className="font-mono break-all">{row.id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Status</div>
                <div className="mt-1">
                  <Badge size="sm" variant="light" color="light">
                    {row.status}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Project</div>
                <div className="font-medium break-words">{row.project_title || "-"}</div>
                <div className="font-mono break-all text-xs text-gray-500 dark:text-gray-400 mt-1">{row.project_id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Commit</div>
                <div className="font-mono break-all">{row.commit_id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">User</div>
                <div className="font-mono break-all">{row.user_id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Created</div>
                <div>{formatTime(row.created_at)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Reviewed by</div>
                <div className="font-mono break-all">{row.reviewed_by || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Reviewed at</div>
                <div>{formatTime(row.reviewed_at)}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">Review note</div>
                <div className="mt-1 whitespace-pre-wrap">{row.review_note || "-"}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">Content</div>
                <div className="mt-1 whitespace-pre-wrap">{row.content || "-"}</div>
              </div>

              <div className="md:col-span-2 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => (window.location.href = `/editor/${row.project_id}`)}>
                  Open editor
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Khong tim thay submission.</div>
          )}
        </ComponentCard>
      </div>

      {row ? (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComponentCard title="Map view">
            <div className="p-4">
              <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
                <Map
                  mode="idle"
                  draft={draft}
                  selectedFeatureId={null}
                  onSelectFeatureId={() => {}}
                  backgroundVisibility={DEFAULT_BACKGROUND_LAYER_VISIBILITY}
                  allowGeometryEditing={false}
                  respectBindingFilter={false}
                  height="320px"
                  fitToDraftBounds
                  fitBoundsKey={row.id}
                />
              </div>
              {isLoadingExtras ? (
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">Dang tai snapshot/commits...</div>
              ) : snapshot ? (
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">Da tai snapshot.</div>
              ) : (
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Khong tim thay snapshot cho commit nay.
                </div>
              )}
            </div>
          </ComponentCard>

          <ComponentCard title="Entities (snapshot)">
            <div className="p-4">
              {snapshotEntities.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Khong co entities trong snapshot.</div>
              ) : (
                <div className="max-w-full overflow-x-auto">
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0d1117] min-w-[720px]">
                    <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#161b22] text-xs font-semibold text-gray-600 dark:text-gray-300">
                      <div className="col-span-2">Op</div>
                      <div className="col-span-6">Name</div>
                      <div className="col-span-4">Entity ID</div>
                    </div>
                    <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
                      {snapshotEntities.map((e) => (
                        <div key={`${e.operation}:${e.id}`} className="grid grid-cols-12 gap-4 px-5 py-3 text-sm">
                          <div className="col-span-2">
                            <Badge size="sm" variant="light" color="dark">
                              {e.operation}
                            </Badge>
                          </div>
                          <div className="col-span-6 min-w-0 truncate">{e.name || "-"}</div>
                          <div className="col-span-4 font-mono text-xs break-all">{e.id}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ComponentCard>
        </div>
      ) : null}

      {row ? (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComponentCard title="Head commit snapshot_json">
            <div className="p-4">
              <pre className="text-xs whitespace-pre-wrap break-words rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117] p-4 overflow-auto max-h-[420px]">
                {JSON.stringify(headCommitSnapshotJson, null, 2)}
              </pre>
            </div>
          </ComponentCard>

          <ComponentCard title="Project members">
            <div className="p-4">
              {!project ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Khong co du lieu project.</div>
              ) : (project.members || []).length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Khong co thanh vien.</div>
              ) : (
                <div className="max-w-full overflow-x-auto">
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0d1117] min-w-[640px]">
                    <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#161b22] text-xs font-semibold text-gray-600 dark:text-gray-300">
                      <div className="col-span-5">Member</div>
                      <div className="col-span-3">Role</div>
                      <div className="col-span-4">User ID</div>
                    </div>
                    <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
                      {(project.members || []).map((m) => (
                        <div key={m.user_id} className="grid grid-cols-12 gap-4 px-5 py-3 text-sm">
                          <div className="col-span-5 min-w-0 truncate">{m.display_name || "-"}</div>
                          <div className="col-span-3">
                            <Badge size="sm" variant="light" color="info">
                              {m.role}
                            </Badge>
                          </div>
                          <div className="col-span-4 font-mono text-xs break-all">{m.user_id}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ComponentCard>
        </div>
      ) : null}

      {row ? (
        <div className="mt-6">
          <ComponentCard title="Commits">
            <div className="p-4">
              {commits.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Khong co commits.</div>
              ) : (
                <div className="max-w-full overflow-x-auto">
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0d1117] min-w-[900px]">
                    <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#161b22] text-xs font-semibold text-gray-600 dark:text-gray-300">
                      <div className="col-span-3">Commit</div>
                      <div className="col-span-5">Title</div>
                      <div className="col-span-2">Created</div>
                      <div className="col-span-2">User</div>
                    </div>
                    <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
                      {commits.map((c) => {
                        const isTarget = c.id === row.commit_id;
                        return (
                          <div
                            key={c.id}
                            className={`grid grid-cols-12 gap-4 px-5 py-3 text-sm ${isTarget ? "bg-brand-50/60 dark:bg-brand-500/10" : ""}`}
                          >
                            <div className="col-span-3 font-mono text-xs break-all">
                              {isTarget ? <b>{c.id}</b> : c.id}
                            </div>
                            <div className="col-span-5 min-w-0 truncate">{c.edit_summary || "-"}</div>
                            <div className="col-span-2 text-xs text-gray-600 dark:text-gray-300">{formatTime(c.created_at)}</div>
                            <div className="col-span-2 font-mono text-xs break-all">{c.user_id}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ComponentCard>
        </div>
      ) : null}
    </div>
  );
}
