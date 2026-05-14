"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import { toast } from "sonner";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Badge from "@/components/ui/badge/Badge";
import { CreateProjectPayload, Project } from "@/interface/project";
import { apiCreateProject, apiCreateProjectCommit, apiGetProjectCommits, getCurrentProject } from "@/service/projectService";
import { normalizeEditorSnapshot } from "@/uhm/lib/editor/snapshot/editorSnapshot";
import type { EditorSnapshot } from "@/uhm/types/projects";

export type ProjectSortColumn = "created_at" | "updated_at" | "title";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportingProjectId, setIsExportingProjectId] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<ProjectSortColumn>("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { isOpen, openModal, closeModal } = useModal();
  const [formData, setFormData] = useState<CreateProjectPayload>({ title: "", description: "", project_status: "PRIVATE" });
  const importJsonInputRef = useRef<HTMLInputElement | null>(null);
  const [importSnapshot, setImportSnapshot] = useState<EditorSnapshot | null>(null);
  const [importSnapshotName, setImportSnapshotName] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const res = await getCurrentProject();
      setProjects(res?.data?.items || res?.data || []);
    } catch (error) {
      console.error("Lỗi khi tải danh sách dự án:", error);
      toast.error("Không thể tải danh sách dự án. Vui lòng thử lại!");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.warning("Vui lòng nhập tên dự án!");
      return;
    }
    try {
      setIsSubmitting(true);
      const created = await apiCreateProject(formData);
      const projectId = created?.data?.id;
      toast.success("Tạo dự án mới thành công!");
      closeModal();
      setFormData({ title: "", description: "", project_status: "PRIVATE" });
      setImportSnapshot(null);
      setImportSnapshotName(null);
      fetchProjects(); 
      if (projectId) router.push(`/editor/${projectId}`);
    } catch (error) {
      console.error("Lỗi tạo dự án:", error);
      toast.error("Có lỗi xảy ra khi tạo dự án.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePickImportJson = () => {
    importJsonInputRef.current?.click();
  };

  const handleImportJsonFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const normalized = normalizeEditorSnapshot(raw);
      if (!normalized) {
        toast.error("JSON snapshot không hợp lệ.");
        return;
      }
      setImportSnapshot(normalized);
      setImportSnapshotName(file.name);
      toast.success("Đã nạp JSON snapshot. Bấm 'Tạo với JSON' để khởi tạo dự án.");
    } catch (err) {
      console.error("Import JSON failed", err);
      toast.error("Không đọc được file JSON.");
    }
  };

  const handleCreateProjectWithJson = async () => {
    if (!formData.title.trim()) {
      toast.warning("Vui lòng nhập tên dự án!");
      return;
    }
    if (!importSnapshot) {
      toast.warning("Chưa chọn JSON snapshot.");
      handlePickImportJson();
      return;
    }
    try {
      setIsSubmitting(true);
      const created = await apiCreateProject(formData);
      const projectId = created?.data?.id;
      if (!projectId) {
        toast.error("Tạo dự án thất bại: thiếu project id.");
        return;
      }
      await apiCreateProjectCommit(projectId, {
        edit_summary: "Init project from JSON",
        snapshot_json: importSnapshot as any,
      } as any);
      toast.success("Tạo dự án (kèm JSON) thành công!");
      closeModal();
      setFormData({ title: "", description: "", project_status: "PRIVATE" });
      setImportSnapshot(null);
      setImportSnapshotName(null);
      if (importJsonInputRef.current) importJsonInputRef.current.value = "";
      fetchProjects();
      router.push(`/editor/${projectId}`);
    } catch (error) {
      console.error("Lỗi tạo dự án với JSON:", error);
      toast.error("Có lỗi xảy ra khi tạo dự án với JSON.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportHeadSnapshot = async (project: Project) => {
    const projectId = String(project.id || "").trim();
    if (!projectId) return;
    const headCommitId = project.latest_commit_id ? String(project.latest_commit_id) : "";
    if (!headCommitId) {
      toast.warning("Dự án chưa có head commit để export.");
      return;
    }
    setIsExportingProjectId(projectId);
    try {
      const res: any = await apiGetProjectCommits(projectId);
      const rawList = res?.data?.items ?? res?.data ?? res?.items ?? [];
      const commits = Array.isArray(rawList) ? rawList : [];
      const head = commits.find((c: any) => String(c?.id || "") === headCommitId) || null;
      const snapshot = head?.snapshot_json ?? null;
      if (!snapshot) {
        toast.error("Không tìm thấy snapshot_json của head commit.");
        return;
      }
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${projectId}-head-${headCommitId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã export JSON snapshot.");
    } catch (err) {
      console.error("Export snapshot failed", err);
      toast.error("Export thất bại.");
    } finally {
      setIsExportingProjectId(null);
    }
  };

  const handleSort = (column: ProjectSortColumn) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  const sortedProjects = [...projects].sort((a: any, b: any) => {
    let valA = a[sortBy];
    let valB = b[sortBy];
    
    if (!valA) valA = "";
    if (!valB) valB = "";

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PUBLIC":
        return <Badge size="sm" variant="light" color="success">PUBLIC</Badge>;
      case "PRIVATE":
        return <Badge size="sm" variant="light" color="warning">PRIVATE</Badge>;
      case "ARCHIVE":
        return <Badge size="sm" variant="light" color="light">ARCHIVE</Badge>;
      default:
        return <Badge size="sm" variant="light" color="dark">{status}</Badge>;
    }
  };

  const SortButton = ({ column, label }: { column: ProjectSortColumn; label: string }) => {
    const isActive = sortBy === column;
    return (
      <button
        onClick={() => handleSort(column)}
        className={`flex items-center gap-1 text-sm font-medium hover:text-blue-500 transition-colors ${
          isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
        }`}
      >
        <span>{label}</span>
        {isActive && <span>{sortOrder === "asc" ? "↑" : "↓"}</span>}
      </button>
    );
  };

  const importLabel = useMemo(() => {
    if (!importSnapshotName) return "Chưa chọn JSON snapshot";
    return `JSON: ${importSnapshotName}`;
  }, [importSnapshotName]);

  return (
    <div className="max-w-7xl mx-auto pb-10">
      <PageBreadcrumb pageTitle="Quản lý dự án" />

      <div className="mt-6">
        <ComponentCard
          title="Danh sách dự án"
          headerAction={
            <Button size="sm" onClick={openModal} className="bg-brand-500 hover:bg-brand-600 text-white">
              + Tạo dự án mới
            </Button>
          }
        >
          <div className="relative min-h-[300px]">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 rounded-xl">
                <div className="w-10 h-10 border-4 border-t-brand-500 rounded-full animate-spin"></div>
              </div>
            )}

            {!isLoading && sortedProjects.length > 0 ? (
              <div className="max-w-full overflow-x-auto">
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0d1117] min-w-[800px]">
                  <div className="flex items-center px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#161b22]">
                    <div className="flex-1 pr-4">
                      <SortButton column="title" label="Tên dự án" />
                    </div>
                    <div className="w-48 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Trạng thái</div>
                    <div className="w-48 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Thành viên</div>
                    <div className="w-32 px-4">
                      <SortButton column="updated_at" label="Cập nhật" />
                    </div>
                    <div className="w-48 px-4 text-sm font-medium text-gray-500 dark:text-gray-400 text-right">Thao tác</div>
                  </div>

                  <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
                    {sortedProjects.map((project: any) => (
                      <div
                        key={project.id}
                        className="group flex items-center p-5 hover:bg-gray-50 dark:hover:bg-[#161b22]/50 transition-colors"
                      >
                        <div className="flex-1 pr-4 min-w-0">
                          <div className="items-center gap-3 mb-1.5">
                            <h3
                              onClick={() => router.push(`/user/projects/${project.id}`)}
                              className="font-semibold text-blue-600 dark:text-[#58a6ff] truncate cursor-pointer hover:underline"
                            >
                              {project.title}
                            </h3>
                            
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#8b949e]">
                            <div className="flex items-center gap-1.5">
                              {project.user?.avatar_url ? (
                                <Image src={project.user.avatar_url} alt="avatar" width={16} height={16} className="rounded-full object-cover" />
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                  <span className="text-[8px] font-bold text-gray-500 dark:text-gray-300">
                                    {project.user?.display_name?.charAt(0)?.toUpperCase() || "U"}
                                  </span>
                                </div>
                              )}
                              <span className="truncate max-w-[150px]">{project.user?.display_name || "Unknown"}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="w-48 px-4 shrink-0">
                          {getStatusBadge(project.project_status)}
                        </div>
                        
                        <div className="w-48 px-4 shrink-0">
                          <div className="flex -space-x-2 overflow-hidden">
                            {project.members && project.members.length > 0 ? (
                              <>
                                {project.members.slice(0, 4).map((m: any, index: number) =>
                                  m.avatar_url ? (
                                    <Image key={index} src={m.avatar_url} alt={m.display_name} width={32} height={32} title={m.display_name} className="inline-block w-8 h-8 rounded-full object-cover ring-2 ring-white dark:ring-[#0d1117]" />
                                  ) : (
                                    <div key={index} title={m.display_name} className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 ring-2 ring-white dark:ring-[#0d1117]">
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-300">{m.display_name?.charAt(0)?.toUpperCase() || "U"}</span>
                                    </div>
                                  )
                                )}
                                {project.members.length > 4 && (
                                  <div title="Những người khác" className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 ring-2 ring-white dark:ring-[#0d1117] z-10">
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">+{project.members.length - 4}</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-600 italic"></span>
                            )}
                          </div>
                        </div>

                        <div className="w-32 px-1 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(project.updated_at)}
                        </div>

                       <div className="w-48 px-4 shrink-0 flex justify-end gap-2">
                          <div className="relative group/btn1 inline-flex">
                            <Button
                              size="sm"
                              variant="outline"
                              className="!p-0 w-9 h-9 flex items-center justify-center"
                              onClick={() => router.push(`/editor/${project.id}`)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </Button>
                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 scale-0 rounded bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-all group-hover/btn1:scale-100 group-hover/btn1:opacity-100 z-50 pointer-events-none whitespace-nowrap shadow-sm dark:bg-gray-700">
                              Editor
                            </span>
                          </div>

                          <div className="relative group/btn2 inline-flex">
                            <Button
                              size="sm"
                              variant="outline"
                              className="!p-0 w-9 h-9 flex items-center justify-center"
                              disabled={isExportingProjectId === String(project.id)}
                              onClick={() => handleExportHeadSnapshot(project)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                            </Button>
                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 scale-0 rounded bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-all group-hover/btn2:scale-100 group-hover/btn2:opacity-100 z-50 pointer-events-none whitespace-nowrap shadow-sm dark:bg-gray-700">
                              Export JSON
                            </span>
                          </div>

                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : !isLoading && (
              <div className="py-20 text-center">
                <p className="text-gray-500 dark:text-gray-400">Bạn chưa có dự án nào.</p>
                <Button size="sm" onClick={openModal} className="mt-4 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200">
                  Tạo dự án đầu tiên
                </Button>
              </div>
            )}
          </div>
        </ComponentCard>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[500px] m-4">
        <div className="p-6 bg-white rounded-3xl dark:bg-gray-900">
          <h3 className="mb-5 text-xl font-bold text-gray-800 dark:text-white/90">Tạo dự án mới</h3>
          <form onSubmit={handleCreateProject} className="flex flex-col gap-5">
            <div>
              <Label>Tên dự án <span className="text-red-500">*</span></Label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Nhập tên dự án..."
                autoFocus
                className="h-11 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
              />
            </div>
            <div>
              <Label>Trạng thái</Label>
              <select
                name="project_status"
                value={formData.project_status}
                onChange={handleChange}
                className="h-11 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800"
              >
                <option value="PRIVATE">Riêng tư (Private)</option>
                <option value="PUBLIC">Công khai (Public)</option>
                <option value="ARCHIVE">Lưu trữ (Archive)</option>
              </select>
            </div>
            <div>
              <Label>Mô tả dự án</Label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800 custom-scrollbar"
                placeholder="Mô tả ngắn gọn về dự án..."
              ></textarea>
            </div>
            <div>
              <Label>Khởi tạo từ JSON</Label>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" type="button" onClick={handlePickImportJson}>
                  Chọn JSON
                </Button>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {importLabel}
                </div>
              </div>
              <input
                ref={importJsonInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => handleImportJsonFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="flex items-center justify-end gap-3 mt-4">
              <Button size="sm" variant="outline" type="button" onClick={closeModal}>Hủy</Button>
              <Button size="sm" type="submit" disabled={isSubmitting} className="bg-brand-500 hover:bg-brand-600 text-white">
                {isSubmitting ? "Đang tạo..." : "Khởi tạo"}
              </Button>
              <Button
                size="sm"
                type="button"
                disabled={isSubmitting}
                className="bg-gray-900 hover:bg-gray-800 text-white"
                onClick={handleCreateProjectWithJson}
              >
                Tạo với JSON
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
