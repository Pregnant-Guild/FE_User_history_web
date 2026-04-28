"use client";
import { Modal } from "../ui/modal";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import { fullDataUser } from "@/interface/admin";
import { useEffect, useState } from "react";
import { MediaDto } from "@/interface/media";
import { apiGetUserMedia } from "@/service/adminService";
import MediaCard from "@/components/user-profile/Media";

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: fullDataUser | null;
  onChangeRole: (user: fullDataUser) => void;
  onDelete: (user: fullDataUser) => void;
  onRestore: (user: fullDataUser) => void;
}

export default function UserDetailModal({
  isOpen,
  onClose,
  user,
  onChangeRole,
  onDelete,
  onRestore,
}: UserDetailModalProps) {
  const [mediaData, setMediaData] = useState<MediaDto | null>(null);
  const [loading, setLoading] = useState(true);

  const formattedData = { data: user };

  useEffect(() => {
    if (user?.id && isOpen) {
      const fetchUserMedia = async () => {
        setLoading(true);
        try {
          const mediaResponse = await apiGetUserMedia(user.id);
          setMediaData(mediaResponse);
        } catch (err) {
          console.error("Lỗi fetch media:", err);
          setMediaData(null);
        } finally {
          setLoading(false);
        }
      };
      fetchUserMedia();
    }
  }, [user?.id, isOpen]);

  if (!user) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[850px] m-4">
      <div className="no-scrollbar relative w-full max-w-[850px] overflow-y-auto rounded-3xl bg-white p-4 dark:bg-gray-900 lg:p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800 dark:text-white">
            Chi tiết người dùng
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 custom-scrollbar max-h-[65vh] overflow-y-auto pr-2">
          <UserMetaCard data={formattedData as any} />
          <UserInfoCard data={formattedData as any} />

          <div className="min-h-[150px] relative">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-brand-500 rounded-full animate-spin"></div>
                <p className="text-sm text-gray-500 animate-pulse">Đang tải tài liệu...</p>
              </div>
            ) : (
              <>
                {(mediaData?.data?.length ?? 0) > 0 ? (
                  <MediaCard data={mediaData ?? {}} />
                ) : (
                  <div className="p-5 border border-dashed border-gray-200 rounded-2xl text-center text-gray-400 text-sm">
                    Người dùng này chưa có dữ liệu media.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-white/[0.05] flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Thao tác quản trị viên
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onChangeRole(user)}
              className="px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20 transition-colors"
            >
              Đổi vai trò
            </button>
            
            {user.is_deleted ? (
              <button
                onClick={() => onRestore(user)}
                className="px-4 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 transition-colors"
              >
                Khôi phục
              </button>
            ) : (
              <button
                onClick={() => onDelete(user)}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
              >
                Khóa / Xóa
              </button>
            )}
          </div>
        </div>

      </div>
    </Modal>
  );
}