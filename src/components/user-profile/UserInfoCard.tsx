"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import { Profile, UserMetaCardProps } from "@/interface/user";
import { apiUpdateUser } from "@/service/userService";
import { toast } from "sonner";
import Link from "next/link";

export default function UserInfoCard({ data }: { data: UserMetaCardProps }) {
  const router = useRouter();
  const { isOpen, openModal, closeModal } = useModal();
  const [formData, setFormData] = useState<Profile>({
    display_name: "",
    phone: "",
    bio: "",
    location: "",
    website: "",
    avatar_url: "",
  });

  useEffect(() => {
    if (data?.data?.profile) {
      setFormData({
        display_name: data.data.profile.display_name || "",
        phone: data.data.profile.phone || "",
        bio: data.data.profile.bio || "",
        location: data.data.profile.location || "",
        website: data.data.profile.website || "",
        avatar_url: data.data.profile.avatar_url || "",
      });
    }
  }, [data, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const userId = data?.data?.id;
    if (!userId) return;

    try {
      const response = await apiUpdateUser(formData);

      if (response && response.status === false) {
        toast.error(response.message || "Cập nhật thất bại.");
        return;
      }

      toast.success("Cập nhật thành công!");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      const serverResponse = error.response?.data;

      if (serverResponse && serverResponse.status === false) {
        const msg = serverResponse.message || "";

        if (msg.includes("idx_user_profiles_phone")) {
          toast.error("Số điện thoại này đã được sử dụng!");
        } else {
          toast.error(msg);
        }
      } else {
        toast.error("Không thể kết nối đến máy chủ hoặc lỗi hệ thống.");
      }

      console.error("Lỗi chi tiết:", error);
    }
  };

  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-6">
            Personal Information
          </h4>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                Full Name
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {data.data?.profile?.display_name || "Full Name"}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                Email address
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {data.data?.email || "Email address"}
              </p>
            </div>
            {data.data?.profile?.phone && (
              <div>
                <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                  Phone
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {data.data?.profile?.phone || "+XXX XXX XXX"}
                </p>
              </div>
            )}

            {data.data?.profile?.bio && (
              <div>
                <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                  Bio
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {data.data?.profile?.bio || "No bio available"}
                </p>
              </div>
            )}

            {data.data?.profile?.location && (
              <div>
                <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                  Address
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {data.data?.profile?.location || "No location available"}
                </p>
              </div>
            )}
            {data.data?.profile?.website && (
              <div>
                <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                  Website
                </p>
                <Link
                  href={data.data?.profile?.website || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-800 dark:text-white/90 hover:text-blue-500 dark:hover:text-blue-400"
                >
                  {data.data?.profile?.website || "No website"}
                </Link>
              </div>
            )}
          </div>
        </div>

        {data.openEdit && (
          <button
            onClick={openModal}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 lg:inline-flex lg:w-auto"
          >
            <svg
              className="fill-current"
              width="18"
              height="18"
              viewBox="0 0 18 18"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z"
                fill=""
              />
            </svg>
            Edit
          </button>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[700px] m-4">
        <div className="no-scrollbar relative w-full max-w-[700px] overflow-y-auto rounded-3xl bg-white p-4 dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              Edit Personal Information
            </h4>
          </div>
          <form className="flex flex-col" onSubmit={handleSave}>
            <div className="custom-scrollbar h-[450px] overflow-y-auto px-2 pb-3">
              <div className="mt-7">
                <h5 className="mb-5 text-lg font-medium text-gray-800 dark:text-white/90 lg:mb-6">
                  Personal Information
                </h5>

                <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                  <div className="col-span-2">
                    <Label>Avatar</Label>
                    <Input
                      type="text"
                      name="avatar_url"
                      defaultValue={formData.avatar_url}
                      onChange={handleChange}
                      disabled
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Display Name</Label>
                    <Input
                      type="text"
                      name="display_name"
                      defaultValue={formData.display_name}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-span-2 lg:col-span-1">
                    <Label>Email Address</Label>
                    <Input
                      type="text"
                      disabled
                      defaultValue={data.data?.email}
                    />
                  </div>

                  <div className="col-span-2 lg:col-span-1">
                    <Label>Phone</Label>
                    <Input
                      type="text"
                      name="phone"
                      defaultValue={formData.phone}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Location</Label>
                    <Input
                      type="text"
                      name="location"
                      defaultValue={formData.location}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Bio</Label>
                    <Input
                      type="text"
                      name="bio"
                      defaultValue={formData.bio}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Website</Label>
                    <Input
                      type="text"
                      name="website"
                      defaultValue={formData.website}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={closeModal}
              >
                Close
              </Button>
              <Button size="sm" type="submit">
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
