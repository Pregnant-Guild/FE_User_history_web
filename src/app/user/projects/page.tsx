"use client";

import React, { useEffect, useState } from "react";
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
import { apiCreateProject, getCurrentProject } from "@/service/projectService";

export type ProjectSortColumn = "created_at" | "updated_at" | "title";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sortBy, setSortBy] = useState<ProjectSortColumn>("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { isOpen, openModal, closeModal } = useModal();
  const [formData, setFormData] = useState<CreateProjectPayload>({ title: "", description: "", project_status: "PRIVATE" });

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
      await apiCreateProject(formData);
      toast.success("Tạo dự án mới thành công!");
      closeModal();
      setFormData({ title: "", description: "", project_status: "PRIVATE" });
      fetchProjects(); 
    } catch (error) {
      console.error("Lỗi tạo dự án:", error);
      toast.error("Có lỗi xảy ra khi tạo dự án.");
    } finally {
      setIsSubmitting(false);
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

  // Helper format ngày
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return `Updated on ${date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`;
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
        className={`w-20 text-sm font-medium text-left hover:text-blue-500 transition-colors ${
          isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {label} {isActive && (sortOrder === "asc" ? "↑" : "↓")}
      </button>
    );
  };

  console.log(projects);

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
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0d1117] min-w-[700px]">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#161b22]">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-40"></span>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-sm text-gray-500 dark:text-gray-400 w-20">Sắp xếp:</span>
                      <SortButton column="title" label="Tên" />
                      <SortButton column="created_at" label="Ngày tạo" />
                      <SortButton column="updated_at" label="Cập nhật" />
                    </div>
                  </div>

                  <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
                    {sortedProjects.map((project: any) => (
                      <div
                        key={project.id}
                        className="group flex flex-col p-5 md:flex-row md:items-center justify-between hover:bg-gray-50 dark:hover:bg-[#161b22] transition-colors"
                      >
                        <div className="flex-1 pr-4 max-w-full md:max-w-[75%]">
                          <div
                            onClick={() => router.push(`/user/projects/${project.id}`)}
                            className="flex items-center gap-2 mb-2 cursor-pointer hover:underline"
                          >
                            <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                              {project.user?.avatar_url ? (
                                <div className="relative w-6 h-6 rounded-full overflow-hidden border border-gray-200 dark:border-gray-800">
                                  <Image
                                    src={project.user.avatar_url}
                                    alt="avatar"
                                    fill
                                    className="object-cover rounded-full"
                                  />
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-gray-300 dark:border-gray-600">
                                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 leading-none">
                                    {project.user?.display_name?.charAt(0)?.toUpperCase() || "U"}
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center max-w-[250px]">
                              <span className="text-[14px] font-medium text-gray-700 dark:text-gray-300 truncate">
                                {project.user?.display_name || "Unknown"}
                              </span>
                            </div>

                            <span className="text-[14px] text-gray-400 dark:text-gray-600 shrink-0">/</span>

                            <h3 className="text-[14px] font-semibold text-blue-600 dark:text-[#58a6ff] truncate max-w-[300px]">
                              {project.title}
                            </h3>

                            <div className="shrink-0 w-20 flex justify-start">
                              {getStatusBadge(project.project_status)}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-[#8b949e] h-5">
                            <span>{formatDate(project.updated_at)}</span>
                          </div>
                        </div>

                        <div className="flex items-center mt-4 md:mt-0 gap-3 w-[340px] justify-end shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/editor/${project.id}`)}
                          >
                            Editor
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/editor/${project.id}?only=wiki`)}
                          >
                            Editor only wiki
                          </Button>

                          <div className="flex -space-x-2 overflow-hidden">
                            {project.members && project.members.length > 0 ? (
                              <>
                                {project.members.slice(0, 4).map((m: any, index: number) =>
                                  m.avatar_url ? (
                                    <Image
                                      key={index}
                                      src={m.avatar_url}
                                      alt={m.display_name}
                                      width={32}
                                      height={32}
                                      title={m.display_name}
                                      className="inline-block w-8 h-8 rounded-full object-cover ring-2 ring-white group-hover:ring-gray-50 dark:ring-[#0d1117] dark:group-hover:ring-[#161b22] transition-colors"
                                    />
                                  ) : (
                                    <div
                                      key={index}
                                      title={m.display_name}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 ring-2 ring-white group-hover:ring-gray-50 dark:ring-[#0d1117] dark:group-hover:ring-[#161b22] transition-colors"
                                    >
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-300">
                                        {m.display_name?.charAt(0)?.toUpperCase() || "U"}
                                      </span>
                                    </div>
                                  )
                                )}

                                {project.members.length > 4 && (
                                  <div
                                    title="Những người khác"
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 ring-2 ring-white group-hover:ring-gray-50 dark:ring-[#0d1117] dark:group-hover:ring-[#161b22] transition-colors z-10"
                                  >
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                      +{project.members.length - 4}
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-600 italic"></span>
                            )}
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

      {/* Modal Tạo Dự án */}
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
            <div className="flex items-center justify-end gap-3 mt-4">
              <Button size="sm" variant="outline" type="button" onClick={closeModal}>Hủy</Button>
              <Button size="sm" type="submit" disabled={isSubmitting} className="bg-brand-500 hover:bg-brand-600 text-white">
                {isSubmitting ? "Đang tạo..." : "Khởi tạo"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
