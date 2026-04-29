"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { UserMetaCardProps } from "@/interface/user";
import { uploadMedia } from "@/service/mediaService";
import { toast } from "sonner";
import { apiUpdateUser } from "@/service/userService";
import { URL_MEDIA } from "../../../api";
import { useRouter } from "next/navigation";

export default function UserMetaCard({ data }: { data: UserMetaCardProps }) {
  const currentAvatar =
    data.data?.profile?.avatar_url || "/images/no-images.jpg";
  const [previewImage, setPreviewImage] = useState(currentAvatar);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();

  useEffect(() => {
    if (data.data?.profile?.avatar_url) {
      setPreviewImage(data.data.profile.avatar_url);
    }
  }, [data.data?.profile?.avatar_url]);

  const handleAvatarClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const backupImage = previewImage;
    setPreviewImage(objectUrl);

    try {
      setIsUploading(true);
      const uploadedMedia = await uploadMedia(file);

      // console.log("Upload thành công:", uploadedMedia);

      if (uploadedMedia?.storage_key) {
        const url = URL_MEDIA + uploadedMedia.storage_key;
        setPreviewImage(url);
        if (data.data) {
          try {
            await apiUpdateUser({ avatar_url: url });
            window.location.href = window.location.pathname;
            toast.success("Cập nhật avatar thành công!");
          } catch (error) {
            console.error("Lỗi khi cập nhật avatar:", error);
            toast.warning("Lỗi khi cập nhật ảnh đại diện. Vui lòng thử lại!");
          }
        }
      }
    } catch (error) {
      console.error("Lỗi khi upload avatar:", error);
      setPreviewImage(backupImage);
      alert("Không thể tải ảnh lên. Vui lòng thử lại!");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col items-center w-full gap-6 xl:flex-row">
          <div
            onClick={handleAvatarClick}
            className="relative w-20 h-20 overflow-hidden border border-gray-200 rounded-full cursor-pointer dark:border-gray-800 group shrink-0"
          >
            <Image
              width={80}
              height={80}
              src={previewImage}
              alt="avatar"
              className="object-cover w-full h-full"
              priority
            />

            <div className="absolute inset-0 flex items-center justify-center transition-opacity bg-black/50 opacity-0 group-hover:opacity-100">
              {isUploading ? (
                <svg
                  className="w-6 h-6 text-white animate-spin"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>

          <div className="order-3 xl:order-2">
            <h4 className="mb-2 text-lg font-semibold text-center text-gray-800 dark:text-white/90 xl:text-left">
              {data.data?.profile?.display_name || "Full Name"}
            </h4>
            <div className="flex flex-col items-center gap-1 text-center xl:flex-row xl:gap-3 xl:text-left">
              <p className="text-sm text-blue-500 dark:text-gray-400">
                {data.data?.roles?.map((role) => role.name).join(", ") ||
                  "No roles available"}
              </p>
              {data.data?.profile?.bio && (
                <>
                  <div className="hidden h-3.5 w-px bg-gray-300 dark:bg-gray-700 xl:block"></div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[450px] truncate">
                    {data.data.profile.bio}
                  </p>
                </>
              )}
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ID: {data.data?.id}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
