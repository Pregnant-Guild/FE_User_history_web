"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Swal from "sweetalert2";
import { apiUpdateApplicationStatus } from "@/service/adminService";
import { URL_MEDIA } from "../../../api";

import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import { IsolatedContent } from "@/components/ui/IsolatedContent";
import { apiDeleteHistorianCV } from "@/service/historianService";
import { statusConfig } from "@/service/handler";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  application: any;
  onRefresh: () => void;
}

export default function ApplicationDetailModal({
  isOpen,
  onClose,
  application,
  onRefresh,
}: Props) {
  const [reviewNote, setReviewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (isOpen && application) {
      setReviewNote(application.review_note || "");
    } else {
      setReviewNote("");
    }
  }, [isOpen, application]);

  const isImageFile = (file: any) => {
    const isImageMime = file.mime_type?.startsWith("image/");
    const isImageExt = /\.(jpg|jpeg|png|webp|gif)$/i.test(file.storage_key);
    return isImageMime || isImageExt;
  };

  const mediaList = application?.media || [];
  const imageMediaOnly = mediaList.filter(isImageFile);

  const imageSlides = imageMediaOnly.map((item: any) => ({
    src: `${URL_MEDIA}${item.storage_key}`,
    title: item.original_name,
    description: `Dung lượng: ${(item.size / 1024).toFixed(2)} KB`,
  }));

  const handleMediaClick = (item: any) => {
    const fileUrl = `${URL_MEDIA}${item.storage_key}`;
    if (isImageFile(item)) {
      const photoIndex = imageMediaOnly.findIndex(
        (img: any) => img.id === item.id,
      );
      setIndex(photoIndex);
    } else {
      const googleDocsUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
      window.open(googleDocsUrl, "_blank");
    }
  };

  const handleUpdateStatus = async (status: "APPROVED" | "REJECTED") => {
    if (!application) return;
    if (!reviewNote.trim()) {
      textareaRef.current?.focus();
      return;
    }
    try {
      setIsSubmitting(true);
      await apiUpdateApplicationStatus(application.id, {
        status,
        review_note: reviewNote,
      });
      Swal.fire("Thành công!", "Trạng thái hồ sơ đã được cập nhật.", "success");
      onRefresh();
      onClose();
    } catch (error) {
      Swal.fire("Lỗi", "Không thể cập nhật trạng thái.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteApplication = async () => {
    await apiDeleteHistorianCV(application.id);
    Swal.fire("Thành công!", "Hồ sơ đã được xóa.", "success");
    onRefresh();
    onClose();
  };

  if (!isOpen || !application) return null;

  const userData = application.user || {};
  const currentStatus = statusConfig[application.status] || {
    container: "bg-gray-50 border-gray-200 text-gray-600 shadow-sm",
  };
  return (
    <div className="fixed inset-0 z-999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl dark:bg-gray-900 flex flex-col overflow-hidden text-gray-800 dark:text-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-xl font-semibold">Chi tiết yêu cầu nâng cấp</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col gap-8">
            <div className="p-5 border border-gray-200 rounded-xl dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02]">
              <h4 className="mb-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                Thông tin ứng viên
              </h4>
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 overflow-hidden border border-gray-200 rounded-full shrink-0">
                  <Image
                    fill
                    src={userData.avatar_url || "/images/no-images.jpg"}
                    alt="avatar"
                    className="object-cover"
                  />
                </div>
                <div>
                  <h4 className="text-lg font-semibold">
                    {userData.display_name || "N/A"}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {userData.email || "Không có email"}
                  </p>
                  <div className="mt-1 flex gap-2 items-center">
                    <span className="px-3 py-1 text-[11px] font-bold uppercase text-blue-600 bg-blue-100 rounded-md ">
                      {application.verify_type}
                    </span>
                    <span
                      className={`
                        inline-flex items-center px-3 py-1 
                        rounded-md border text-[11px] font-semibold uppercase 
                        transition-colors duration-200
                        ${currentStatus.container}
                      `}
                        >
                      {application.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                Nội dung ứng tuyển
              </h4>
              <div className="p-4 prose bg-white border border-gray-200 min-h-[100px] rounded-xl dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 max-w-none">
                <IsolatedContent html={application.content} />
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                Tệp đính kèm ({mediaList.length})
              </h4>
              {mediaList.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {mediaList.map((media: any, idx: number) => {
                    const isImg = isImageFile(media);
                    return (
                      <div
                        key={idx}
                        onClick={() => handleMediaClick(media)}
                        className="relative overflow-hidden border border-gray-200 group aspect-square rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-pointer"
                      >
                        {isImg ? (
                          <Image
                            src={`${URL_MEDIA}${media.storage_key}`}
                            alt="media"
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-110"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center w-full h-full p-3 text-center">
                            <div className="w-10 h-10 mb-2 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-lg shadow-sm text-xl">
                              📄
                            </div>
                            <span className="text-[10px] font-medium text-gray-600 line-clamp-2">
                              {media.original_name}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center transition-opacity bg-black/40 opacity-0 group-hover:opacity-100 z-10">
                          <span className="text-white text-xs font-bold px-3 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/30">
                            {isImg ? "Xem ảnh" : "Xem file"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm italic text-gray-400">
                  Không có tệp đính kèm.
                </p>
              )}
            </div>

            <div>
              <h4 className="mb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                Ghi chú duyệt hồ sơ
              </h4>
              <textarea
                ref={textareaRef}
                className="w-full p-4 text-sm bg-white border border-gray-200 rounded-xl dark:border-gray-800 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none h-[100px]"
                placeholder="Nhập lý do (bắt buộc)..."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                disabled={application.status !== "PENDING"}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200 dark:bg-gray-900/50 dark:border-gray-800">
          {application.status === "PENDING" && (
            <>
              <button
                onClick={() => handleUpdateStatus("REJECTED")}
                disabled={isSubmitting}
                className="px-5 py-2 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600"
              >
                Từ chối
              </button>
              <button
                onClick={() => handleUpdateStatus("APPROVED")}
                disabled={isSubmitting}
                className="px-5 py-2 text-sm font-medium text-white bg-green-500 rounded-xl hover:bg-green-600"
              >
                Phê duyệt
              </button>
            </>
          )}
          <button
            onClick={handleDeleteApplication}
            className="px-5 py-2 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600"
          >
            Xóa
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>

      <Lightbox
        index={index}
        open={index >= 0}
        close={() => setIndex(-1)}
        slides={imageSlides}
        plugins={[Zoom, Captions]}
        styles={{ root: { zIndex: 999999 } }}
      />
    </div>
  );
}
