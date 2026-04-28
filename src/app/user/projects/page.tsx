"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import { getCurrentProject, apiCreateProject, CreateProjectPayload } from "@/service/projectService";
import { toast } from "sonner";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { Project } from "@/interface/project";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
      fetchProjects(); // Tải lại danh sách sau khi tạo
    } catch (error) {
      console.error("Lỗi tạo dự án:", error);
      toast.error("Có lỗi xảy ra khi tạo dự án.");
    } finally {
      setIsSubmitting(false);
    }
  };

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

            {projects.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                <div className="max-w-full overflow-x-auto">
                  <div className="min-w-[800px]">
                    <Table>
                      <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                        <TableRow>
                          <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                            Tên dự án
                          </TableCell>
                          <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                            Mô tả
                          </TableCell>
                          <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-center text-theme-xs dark:text-gray-400">
                            Trạng thái
                          </TableCell>
                          <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-center text-theme-xs dark:text-gray-400">
                            Thao tác
                          </TableCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                        {projects.map((project) => (
                          <TableRow key={project.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-colors">
                            <TableCell className="px-5 py-4 text-start text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                              {project.title}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-500 dark:text-gray-400 max-w-[300px]">
                              <p className="truncate">{project.description || "Chưa có mô tả cho dự án này..."}</p>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-center">
                              <Badge size="sm" variant="light" color={project.project_status === "PUBLIC" ? "success" : project.project_status === "PRIVATE" ? "warning" : "light"}>
                                {project.project_status || "N/A"}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-center">
                              <Link
                                href={`/user/projects/${project.id}`}
                                className="text-brand-500 hover:text-brand-600 font-medium text-theme-sm"
                              >
                                Thao tác
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
              <select name="status" value={formData.project_status} onChange={(e: any) => handleChange(e)} className="h-11 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800">
                <option value="PRIVATE">Riêng tư (Private)</option>
                <option value="PUBLIC">Công khai (Public)</option>
                <option value="ARCHIVE">Lưu trữ (Archive)</option>
              </select>
            </div>
            <div>
              <Label>Mô tả dự án</Label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="w-full rounded-xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:focus:border-brand-800 custom-scrollbar" placeholder="Mô tả ngắn gọn về dự án..."></textarea>
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