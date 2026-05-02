"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";

import { Project } from "@/interface/project";
import Swal from "sweetalert2";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { apiAddProjectMember, apiChangeProjectOwner, apiDeleteProject, apiGetProjectDetail, apiRemoveProjectMember, apiUpdateProject, apiUpdateProjectMemberRole } from "@/service/projectService";
import Loading from "@/app/loading";
import Button from "@/components/ui/button/Button";

type TabType = "overview" | "members" | "settings";

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    status: "PRIVATE" as any,
  });
  const [newOwnerId, setNewOwnerId] = useState("");
  const [newMember, setNewMember] = useState({
    user_id: "",
    role: "EDITOR" as any,
  });

  const fetchProject = async () => {
    setLoading(true);
    try {
      const res = await apiGetProjectDetail(id);
      if (res?.status && res.data) {
        setProject(res.data);
        setEditForm({
          title: res.data.title,
          description: res.data.description,
          status: res.data.project_status,
        });
      }
    } catch (error) {
      toast.error("Lỗi khi tải dữ liệu dự án");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchProject();
  }, [id]);

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiUpdateProject(id, editForm);
      toast.success("Cập nhật thông tin thành công!");
      fetchProject();
    } catch (error) {
      toast.error("Cập nhật thất bại");
    }
  };

  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();

    const memberName =
      project?.members?.find((m) => m.user_id === newOwnerId)?.display_name ||
      "thành viên này";

    const result = await Swal.fire({
      title: "Chuyển quyền sở hữu?",
      html: `Bạn có chắc chắn muốn chuyển dự án này cho <b>${memberName}</b>?<br/>Hành động này <b>không thể hoàn tác</b> và bạn sẽ không còn là chủ sở hữu nữa.`,
      icon: "error",
      showCancelButton: true,
      confirmButtonColor: "#238636",
      cancelButtonColor: "#30363d",
      confirmButtonText: "Tôi hiểu, chuyển quyền sở hữu",
      cancelButtonText: "Hủy bỏ",
      color: "#333",
      customClass: {
        popup: "border border-[#30363d] rounded-xl",
      },
    });

    if (result.isConfirmed) {
      try {
        const res = await apiChangeProjectOwner(id, {
          new_owner_id: newOwnerId,
        });
        if (res?.status) {
          toast.success("Đã chuyển quyền sở hữu thành công!");
          setNewOwnerId("");
          fetchProject();
        } else {
          toast.error(res?.message || "Chuyển quyền thất bại");
        }
      } catch (error) {
        toast.error("Lỗi hệ thống khi chuyển quyền");
      }
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.user_id) return toast.error("Vui lòng nhập User ID");
    try {
      await apiAddProjectMember(id, newMember);
      toast.success("Thêm thành viên thành công");
      setNewMember({ user_id: "", role: "EDITOR" });
      fetchProject();
    } catch (error) {
      toast.error("Lỗi thêm thành viên");
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const res = await apiUpdateProjectMemberRole(id, userId, {
        role: newRole as any,
      });

      if (res?.status) {
        toast.success("Cập nhật quyền thành công");
        fetchProject();
      } else {
        toast.error(res?.message || "Cập nhật quyền thất bại");
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || "Cập nhật quyền thất bại";
      toast.error(errorMessage);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    // 1. Hiển thị hộp thoại xác nhận bằng SweetAlert2
    const result = await Swal.fire({
      title: "Xác nhận xóa?",
      text: "Bạn có chắc chắn muốn xóa thành viên này khỏi dự án?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Đồng ý",
      cancelButtonText: "Hủy",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await apiRemoveProjectMember(id, userId);

      if (res?.status) {
        toast.success("Đã xóa thành viên");
      } else {
        toast.error(res?.message || "Xóa thành viên thất bại");
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || "Xóa thành viên thất bại";
      toast.error(errorMessage);

      console.error("Remove Member Error:", error);
    } finally {
      fetchProject();
    }
  };

  const handleDeleteProject = async () => {
    const result = await Swal.fire({
      title: "Xác nhận xóa dự án?",
      text: "Hành động này sẽ xóa vĩnh viễn dự án. Bạn không thể hoàn tác sau khi xác nhận!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#30363d",
      confirmButtonText: "Tôi hiểu, xóa dự án này",
      cancelButtonText: "Hủy",
      color: "#333",
      customClass: {
        popup: "border border-[#30363d] rounded-xl",
      },
    });

    if (result.isConfirmed) {
      try {
        const res = await apiDeleteProject(id);
        if (res?.status) {
          toast.success("Đã xóa dự án thành công");
          router.push("/user/projects");
        } else {
          toast.error(res?.message || "Xóa dự án thất bại");
        }
      } catch (error : any) {
        toast.error(error.response?.data?.message || "Xóa dự án thất bại");
        console.error(error);
      }
    }
  };

  if (loading) return <Loading />;

  if (!project)
    return (
      <div className="flex justify-center p-20 text-red-500">
        Không tìm thấy dự án
      </div>
    );

  // console.log(project)
  return (
    <div className="min-h-screen  dark:bg-[#0d1117] text-gray-900 dark:text-[#c9d1d9] font-sans">
      <PageBreadcrumb 
        pageTitle="Chi tiết dự án" 
        paths={[{ name: "Quản lý dự án", href: "/user/projects" }]} 
      />
      <div className="pt-8 border-b border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117]">
        <div className="px-6">
          <div className="flex items-center gap-2 text-xl mb-6">
            <div className="w-8 h-8 shrink-0 flex items-center justify-center">
              {project.user?.avatar_url ? (
                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-200 dark:border-gray-800">
                  <Image
                    src={project.user.avatar_url}
                    alt="avatar"
                    fill
                    className="object-cover rounded-full"
                  />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-gray-300 dark:border-gray-600">
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 leading-none">
                    {project.user?.display_name?.charAt(0)?.toUpperCase() ||
                      "U"}
                  </span>
                </div>
              )}
            </div>

            <span className="font-medium text-blue-600 dark:text-[#58a6ff] hover:underline cursor-pointer">
              {project.user?.display_name}
            </span>
            <span className="text-gray-400">/</span>
            <strong className="font-semibold text-blue-600 dark:text-[#58a6ff] hover:underline cursor-pointer">
              {project.title}
            </strong>
            <span className="ml-2 px-2.5 py-0.5 text-xs font-medium rounded-full border border-gray-200 dark:border-[#30363d] text-gray-500 dark:text-[#8b949e]">
              {project.project_status}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {[
              {
                id: "overview",
                label: "Overview",
                icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
              },
              {
                id: "members",
                label: `Members`,
                count: project.members?.length || 0,
                icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
              },
              {
                id: "settings",
                label: "Settings",
                icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-[#f78166] text-gray-900 dark:text-[#c9d1d9]"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-[#8b949e]"
                }`}
              >
                <svg
                  className="w-4 h-4 opacity-70"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={tab.icon}
                  />
                </svg>
                {tab.label}
                {tab.count !== undefined && (
                  <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-200/50 dark:bg-[#21262d] text-gray-600 dark:text-[#c9d1d9]">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}

            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => router.push(`/editor/${id}`)}>
              Mo editor
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push(`/editor/${id}?only=wiki`)}>
              Editor only wiki
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 py-8">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-3">
              <div className="border border-gray-200 dark:border-[#30363d] rounded-xl overflow-hidden ">
                <div className="bg-gray-50 dark:bg-[#161b22] px-5 py-3 border-b border-gray-200 dark:border-[#30363d] font-semibold text-sm text-gray-800 dark:text-[#c9d1d9]">
                  About
                </div>
                <div className="p-6 bg-white dark:bg-[#0d1117] text-[15px] leading-relaxed text-gray-700 dark:text-[#8b949e]">
                  {project.description || (
                    <i className="text-gray-400">
                      Không có mô tả cho dự án này.
                    </i>
                  )}
                </div>
              </div>
            </div>

            <div className="md:col-span-1 space-y-6">
              <div>
                <h3 className="font-semibold text-sm mb-4 border-b border-gray-200 dark:border-[#30363d] pb-2 text-gray-800 dark:text-[#c9d1d9]">
                  Owner
                </h3>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                    {project.user?.avatar_url ? (
                      <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-200 dark:border-gray-800">
                        <Image
                          src={project.user.avatar_url}
                          alt="avatar"
                          fill
                          className="object-cover rounded-full"
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-gray-300 dark:border-gray-600">
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 leading-none">
                          {project.user?.display_name
                            ?.charAt(0)
                            ?.toUpperCase() || "U"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-semibold text-sm text-gray-800 dark:text-[#c9d1d9] truncate">
                      {project.user?.display_name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-[#8b949e] truncate">
                      {project.user?.email || "No email"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "members" && (
          <div className="max-w-4xl">
            <h2 className="text-2xl font-normal mb-6 pb-2 border-b border-gray-200 dark:border-[#30363d]">
              Manage access
            </h2>

            <form
              onSubmit={handleAddMember}
              className="flex flex-col sm:flex-row gap-3 mb-8 p-5 border border-gray-200 dark:border-[#30363d] rounded-xl bg-gray-50 dark:bg-[#161b22] "
            >
              <input
                type="text"
                placeholder="User ID..."
                value={newMember.user_id}
                onChange={(e) =>
                  setNewMember({ ...newMember, user_id: e.target.value })
                }
                className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#0d1117] outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-shadow"
              />
              <div className="flex gap-3">
                <select
                  value={newMember.role}
                  onChange={(e) =>
                    setNewMember({ ...newMember, role: e.target.value as any })
                  }
                  className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#0d1117] outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 cursor-pointer"
                >
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-[#238636] border border-transparent rounded-md hover:bg-[#2ea043] transition-colors "
                >
                  Add member
                </button>
              </div>
            </form>

            <div className="border border-gray-200 dark:border-[#30363d] rounded-xl overflow-hidden ">
              <div className="divide-y divide-gray-200 dark:divide-[#30363d]">
                {project.members && project.members.length > 0 ? (
                  project.members.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-[#161b22]/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <img
                          src={
                            member.avatar_url ||
                            "https://github.com/identicons/jasonlong.png"
                          }
                          alt={member.display_name}
                          className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700"
                        />
                        <div>
                          <div className="font-semibold text-sm text-gray-800 dark:text-[#c9d1d9]">
                            {member.display_name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-[#8b949e]">
                            ID: {member.user_id}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleUpdateRole(member.user_id, e.target.value)
                          }
                          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#21262d] outline-none hover:bg-gray-50 dark:hover:bg-[#30363d] cursor-pointer transition-colors"
                        >
                          <option value="EDITOR">Editor</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          className="text-red-500 hover:text-red-600 p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Remove member"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-gray-500 dark:text-[#8b949e] text-sm italic">
                    Chưa có thành viên nào.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="max-w-3xl space-y-10">
            <section>
              <h2 className="text-2xl font-normal mb-4 pb-2 border-b border-gray-200 dark:border-[#30363d]">
                General
              </h2>
              <form onSubmit={handleUpdateInfo} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-gray-800 dark:text-[#c9d1d9]">
                    Project name
                  </label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm({ ...editForm, title: e.target.value })
                    }
                    className="w-full max-w-md px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#0d1117] outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-gray-800 dark:text-[#c9d1d9]">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#0d1117] outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-gray-800 dark:text-[#c9d1d9]">
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        status: e.target.value as any,
                      })
                    }
                    className="w-48 px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#0d1117] outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 cursor-pointer"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private</option>
                    <option value="ARCHIVE">Archive</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium rounded-md bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:bg-[#30363d] transition-colors "
                >
                  Update settings
                </button>
              </form>
            </section>

            <section>
              <h2 className="text-2xl font-normal text-red-500 mb-4 pb-2 border-b border-red-500/30">
                Danger Zone
              </h2>
              <div className="border border-red-500/30 rounded-xl overflow-hidden">
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-sm text-gray-800 dark:text-[#c9d1d9]">
                      Transfer ownership
                    </div>
                    <div className="text-xs text-gray-500 dark:text-[#8b949e] mt-1">
                      Transfer this project to another member in the project.
                    </div>
                  </div>
                  <form
                    onSubmit={handleTransferOwnership}
                    className="flex gap-2"
                  >
                    <select
                      value={newOwnerId}
                      onChange={(e) => setNewOwnerId(e.target.value)}
                      className="w-full sm:w-56 px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#0d1117] outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 cursor-pointer"
                      required
                    >
                      <option value="" disabled>
                        -- Thành viên --
                      </option>
                      {project.members && project.members.length > 0 ? (
                        project.members.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.display_name}
                          </option>
                        ))
                      ) : (
                        <option value="" disabled>
                          Chưa có thành viên nào
                        </option>
                      )}
                    </select>
                    <button
                      type="submit"
                      disabled={
                        !newOwnerId ||
                        !project.members ||
                        project.members.length === 0
                      }
                      className="shrink-0 px-4 py-2 text-sm font-medium text-red-500 bg-transparent border border-red-500/50 rounded-md hover:bg-red-500 hover:text-white dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-red-500 dark:disabled:hover:bg-transparent"
                    >
                      Transfer
                    </button>
                  </form>
                </div>
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-red-50/30 dark:hover:bg-red-900/10 transition-colors">
                  <div>
                    <div className="font-semibold text-sm text-gray-800 dark:text-[#c9d1d9]">
                      Delete this project
                    </div>
                    <div className="text-xs text-gray-500 dark:text-[#8b949e] mt-1">
                      Once you delete a project, there is no going back. Please
                      be certain.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDeleteProject}
                    className="shrink-0 px-4 py-2 text-sm font-medium text-red-500 bg-transparent border border-red-500/50 rounded-md hover:bg-red-500 hover:text-white dark:hover:bg-red-900/30 transition-colors"
                  >
                    Delete project
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
