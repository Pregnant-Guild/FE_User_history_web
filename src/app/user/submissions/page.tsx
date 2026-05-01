"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";

import type { Submission, SubmissionStatus } from "@/interface/submission";
import { apiSearchSubmissions, apiUpdateSubmissionStatus } from "@/service/submissionService";

type Decision = "APPROVED" | "REJECTED";

function statusBadge(status: SubmissionStatus) {
  switch (status) {
    case "PENDING":
      return (
        <Badge size="sm" variant="light" color="warning">
          PENDING
        </Badge>
      );
    case "APPROVED":
      return (
        <Badge size="sm" variant="light" color="success">
          APPROVED
        </Badge>
      );
    case "REJECTED":
      return (
        <Badge size="sm" variant="light" color="error">
          REJECTED
        </Badge>
      );
    default:
      return (
        <Badge size="sm" variant="light" color="light">
          {String(status || "UNKNOWN")}
        </Badge>
      );
  }
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("vi-VN");
}

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");

  const { isOpen, openModal, closeModal } = useModal();
  const [active, setActive] = useState<Submission | null>(null);
  const [decision, setDecision] = useState<Decision>("APPROVED");
  const [reviewNote, setReviewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const query = useMemo(() => {
    const trimmedSearch = search.trim();
    const trimmedProject = projectId.trim();
    return {
      page,
      limit,
      project_id: trimmedProject.length ? trimmedProject : undefined,
      search: trimmedSearch.length ? trimmedSearch : undefined,
      statuses: status === "ALL" ? undefined : ([status] as any),
      sort: "created_at" as const,
    };
  }, [limit, page, projectId, search, status]);

  const fetchList = async () => {
    try {
      setIsLoading(true);
      const res = await apiSearchSubmissions(query);
      const payload = res?.data;
      const rows = payload?.data || [];
      setItems(rows);
      setTotalPages(payload?.pagination?.total_pages || 1);
    } catch (err) {
      console.error(err);
      toast.error("Khong the tai danh sach submissions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const openReview = (row: Submission, nextDecision: Decision) => {
    setActive(row);
    setDecision(nextDecision);
    setReviewNote("");
    openModal();
  };

  const submitDecision = async () => {
    if (!active) return;
    const note = reviewNote.trim();
    if (note.length < 10) {
      toast.error("Review note toi thieu 10 ky tu.");
      return;
    }

    try {
      setIsSubmitting(true);
      await apiUpdateSubmissionStatus(active.id, { status: decision, review_note: note });
      toast.success(decision === "APPROVED" ? "Da duyet submission." : "Da tu choi submission.");
      closeModal();
      await fetchList();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Cap nhat trang thai that bai.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-10">
      <PageBreadcrumb pageTitle="Kiem duyet submissions" />

      <div className="mt-6">
        <ComponentCard title="Danh sach submissions">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
            <div className="md:col-span-2">
              <Label>Search</Label>
              <input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Tim theo keyword (>= 2 ky tu)"
                className="h-11 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
              />
            </div>
            <div>
              <Label>Project ID</Label>
              <input
                value={projectId}
                onChange={(e) => {
                  setPage(1);
                  setProjectId(e.target.value);
                }}
                placeholder="UUID"
                className="h-11 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
              />
            </div>
            <div>
              <Label>Status</Label>
              <select
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value as any);
                }}
                className="h-11 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
              >
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="ALL">ALL</option>
              </select>
            </div>
          </div>

          <div className="relative min-h-[260px]">
            {isLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 rounded-xl">
                <div className="w-10 h-10 border-4 border-t-brand-500 rounded-full animate-spin" />
              </div>
            ) : null}

            <div className="max-w-full overflow-x-auto">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0d1117] min-w-[900px]">
                <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#161b22] text-xs font-semibold text-gray-600 dark:text-gray-300">
                  <div className="col-span-4">Project</div>
                  <div className="col-span-2">Submitter</div>
                  <div className="col-span-1">Status</div>
                  <div className="col-span-2">Created</div>
                  <div className="col-span-3 text-right">Actions</div>
                </div>

                <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
                  {items.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Khong co submissions.</div>
                  ) : null}
                  {items.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-12 gap-4 px-5 py-4 text-sm hover:bg-gray-50 dark:hover:bg-[#161b22] cursor-pointer"
                      onClick={(e) => {
                        const target = e.target as HTMLElement | null;
                        if (target && target.closest("button")) return;
                        window.location.href = `/user/submissions/${row.id}`;
                      }}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") window.location.href = `/user/submissions/${row.id}`;
                      }}
                    >
                      <div className="col-span-4 min-w-0">
                        <div className="font-medium text-gray-800 dark:text-gray-200 truncate">
                          {row.project_title || row.project_id}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          Submission:{" "}
                          <Link className="hover:underline" href={`/user/submissions/${row.id}`}>
                            {row.id}
                          </Link>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          Commit: {row.commit_id}
                        </div>
                      </div>
                      <div className="col-span-2 min-w-0 text-xs text-gray-600 dark:text-gray-300 truncate">
                        {row.user?.display_name || row.user?.email || row.user_id}
                      </div>
                      <div className="col-span-1">{statusBadge(row.status)}</div>
                      <div className="col-span-2 text-xs text-gray-600 dark:text-gray-300">{formatTime(row.created_at)}</div>
                      <div className="col-span-3 flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => (window.location.href = `/editor/${row.project_id}`)}
                        >
                          Open editor
                        </Button>
                        {row.status === "PENDING" ? (
                          <>
                            <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" onClick={() => openReview(row, "APPROVED")}>
                              Duyet
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openReview(row, "REJECTED")}>
                              Tu choi
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openReview(row, row.status === "APPROVED" ? "REJECTED" : "APPROVED")}>
                            Doi trang thai
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} / {totalPages}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Prev
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        </ComponentCard>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[620px] m-4">
        <div className="p-6 bg-white rounded-3xl dark:bg-gray-900">
          <h3 className="mb-2 text-xl font-bold text-gray-800 dark:text-white/90">
            {decision === "APPROVED" ? "Duyet submission" : "Tu choi submission"}
          </h3>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 break-all">
            {active?.id}
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <Label>Review note (&gt;= 10 ky tu)</Label>
              <textarea
                rows={4}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800 custom-scrollbar"
                placeholder={decision === "APPROVED" ? "Ly do duyet..." : "Ly do tu choi..."}
              />
            </div>

            <div className="flex items-center justify-end gap-3 mt-2">
              <Button size="sm" variant="outline" type="button" onClick={closeModal} disabled={isSubmitting}>
                Huy
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={submitDecision}
                disabled={isSubmitting}
                className={decision === "APPROVED" ? "bg-brand-500 hover:bg-brand-600 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              >
                {isSubmitting ? "Dang xu ly..." : decision === "APPROVED" ? "Duyet" : "Tu choi"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
