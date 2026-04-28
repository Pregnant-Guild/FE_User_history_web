"use client";
import { useState, useEffect } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import Swal from "sweetalert2";
import { MediaDto } from "@/interface/media";
import { URL_MEDIA } from "../../../api";

import { deleteMedia } from "@/service/mediaService";
import { INITIAL_LIMIT } from "../../../constant";

export default function MediaLibrary({
  data,
  onRefresh,
}: {
  data: MediaDto;
  onRefresh?: () => void;
}) {
  const [index, setIndex] = useState(-1);

  const [showAllImages, setShowAllImages] = useState(false);
  const [showAllDocs, setShowAllDocs] = useState(false);

  const [localMedia, setLocalMedia] = useState(data?.data || []);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setLocalMedia(data?.data || []);
  }, [data]);

  const isImageFile = (file: any) => {
    const isImageMime = file.mime_type?.startsWith("image/");
    const isImageExt = /\.(jpg|jpeg|png|webp|gif)$/i.test(file.storage_key);
    return isImageMime || isImageExt;
  };

  const imageFiles = localMedia.filter(isImageFile);
  const documentFiles = localMedia.filter((file) => !isImageFile(file));

  const displayedImages = showAllImages
    ? imageFiles
    : imageFiles.slice(0, INITIAL_LIMIT);
  const displayedDocs = showAllDocs
    ? documentFiles
    : documentFiles.slice(0, INITIAL_LIMIT);

  const imageSlides = imageFiles.map((item) => ({
    src: `${URL_MEDIA}${item.storage_key}`,
    title: item.original_name,
    description: `Kích thước: ${(item.size / 1024).toFixed(2)} KB - Loại: ${item.mime_type}`,
  }));

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedIds([]);
    }
  };

  const toggleItemSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds([id]);
      return;
    }

    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleItemClick = (item: any, idx: number, isImage: boolean) => {
    if (isSelectionMode) {
      toggleItemSelection(item.id);
    } else {
      if (isImage) {
        setIndex(idx);
      } else {
        const fileUrl = `${URL_MEDIA}${item.storage_key}`;
        const googleDocsUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
        window.open(googleDocsUrl, "_blank");
      }
    }
  };

  const handleDeleteSelected = async () => {
    const result = await Swal.fire({
      title: "Xóa tệp đính kèm?",
      text: `Bạn chuẩn bị xóa ${selectedIds.length} tệp. Hành động này không thể hoàn tác!`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Xóa vĩnh viễn",
      cancelButtonText: "Hủy",
    });

    if (result.isConfirmed) {
      try {
        await deleteMedia(selectedIds);
        setLocalMedia((prev) =>
          prev.filter((item) => !selectedIds.includes(item.id)),
        );
        setIsSelectionMode(false);
        setSelectedIds([]);
        Swal.fire("Thành công!", "Các tệp đã được xóa.", "success");
        if (onRefresh) onRefresh();
      } catch (error) {
        Swal.fire("Lỗi!", "Không thể xóa tệp, vui lòng thử lại.", "error");
      }
    }
  };

  const handleDeleteFromLightbox = async () => {
    const currentImage = imageFiles[index];
    if (!currentImage) return;

    const result = await Swal.fire({
      title: "Xóa ảnh này?",
      text: "Bạn có chắc chắn muốn xóa ảnh này không?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Xóa",
      cancelButtonText: "Hủy",
      // customClass: { container: 'z-99999999999999999999999' }
    });

    if (result.isConfirmed) {
      try {
        await deleteMedia([currentImage.id]);
        setLocalMedia((prev) =>
          prev.filter((item) => item.id !== currentImage.id),
        );

        if (imageFiles.length === 1) {
          setIndex(-1);
        } else if (index >= imageFiles.length - 1) {
          setIndex(index - 1);
        }

        Swal.fire({
          title: "Thành công!",
          text: "Ảnh đã được xóa.",
          icon: "success",
          customClass: { container: "z-[9999999999]" },
        });
        if (onRefresh) onRefresh();
      } catch (error) {
        Swal.fire({
          title: "Lỗi!",
          text: "Không thể xóa ảnh.",
          icon: "error",
          customClass: { container: "z-[9999999999]" },
        });
      }
    }
  };

  const renderItemCard = (item: any, isImage: boolean, idx: number) => {
    const isSelected = selectedIds.includes(item.id);

    return (
      <div
        key={item.id}
        onClick={() => handleItemClick(item, idx, isImage)}
        className={`group relative aspect-square cursor-pointer overflow-hidden rounded-xl border-2 transition-all  ${
          isSelected
            ? "border-blue-500 ring-2 ring-blue-500/30"
            : "border-gray-200 hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 dark:border-zinc-700 dark:hover:ring-offset-zinc-900"
        } ${isImage ? "bg-gray-100 dark:bg-zinc-800" : "bg-gray-50 dark:bg-zinc-800"}`}
      >
        <div
          onClick={(e) => toggleItemSelection(item.id, e)}
          className={`absolute right-2 top-2 z-30 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-200 ${
            isSelected
              ? "border-blue-500 bg-blue-500"
              : "border-white bg-black/40 opacity-0 group-hover:opacity-100"
          } ${isSelectionMode && !isSelected ? "opacity-100" : ""}`}
        >
          {isSelected && (
            <svg
              className="h-3.5 w-3.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>

        {isImage ? (
          <>
            <img
              src={`${URL_MEDIA}${item.storage_key}`}
              alt={item.original_name}
              className={`h-full w-full object-cover transition-transform duration-500 ${isSelected ? "scale-105 opacity-80" : "group-hover:scale-110"}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="absolute bottom-0 w-full p-3 text-white">
                <p className="truncate text-sm font-medium ">
                  {item.original_name}
                </p>
                <p className="text-xs text-gray-300">
                  {(item.size / 1024).toFixed(0)} KB
                </p>
              </div>
            </div>
            {!isSelectionMode && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                  Xem ảnh
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div
              className={`flex h-full w-full flex-col items-center justify-center p-3 text-center transition-opacity ${isSelected ? "opacity-80" : ""}`}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-2xl  dark:bg-zinc-700">
                📄
              </div>
              <span className="line-clamp-2 px-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                {item.original_name}
              </span>
            </div>
            {!isSelectionMode && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                  Xem file
                </span>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6  dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h3 className="text-xl font-bold text-gray-800 dark:text-white/90">
          Media Assets
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({localMedia.length} tệp)
          </span>
        </h3>

        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20"
            >
              <svg
                className="h-4 w-4"
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
              Xóa ({selectedIds.length})
            </button>
          )}

          <button
            onClick={toggleSelectionMode}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all w-17.5 h-10 ${
              isSelectionMode
                ? "bg-blue-500 text-white shadow-md hover:bg-blue-600"
                : "border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
            }`}
          >
            {isSelectionMode ? "Hủy" : "Chọn"}
          </button>
        </div>
      </div>

      <div className="space-y-10">
        {imageFiles.length > 0 && (
          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Hình ảnh ({imageFiles.length})
            </h4>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {" "}
              {displayedImages.map((item, idx) =>
                renderItemCard(item, true, idx),
              )}
            </div>
            {imageFiles.length > INITIAL_LIMIT && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setShowAllImages(!showAllImages)}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300"
                >
                  {showAllImages
                    ? "Thu gọn"
                    : `Xem thêm ${imageFiles.length - INITIAL_LIMIT} hình ảnh`}
                </button>
              </div>
            )}
          </div>
        )}

        {documentFiles.length > 0 && (
          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Tài liệu ({documentFiles.length})
            </h4>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
             
              {displayedDocs.map((item, idx) =>
                renderItemCard(item, false, idx),
              )}
            </div>
            {documentFiles.length > INITIAL_LIMIT && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setShowAllDocs(!showAllDocs)}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300"
                >
                  {showAllDocs
                    ? "Thu gọn"
                    : `Xem thêm ${documentFiles.length - INITIAL_LIMIT} tài liệu`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Lightbox
        index={index}
        open={index >= 0}
        close={() => setIndex(-1)}
        slides={imageSlides}
        plugins={[Zoom, Captions]}
        toolbar={{
          buttons: [
            <button
              key="delete"
              type="button"
              className="yarl__button text-red-500"
              title="Xóa ảnh này"
              onClick={handleDeleteFromLightbox}
            >
              <svg
                className="w-6 h-6"
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
            </button>,
            "zoom",
            "close",
          ],
        }}
        zoom={{ maxZoomPixelRatio: 3 }}
        animation={{ zoom: 200 }}
        styles={{
          root: { zIndex: 99, "--yarl__color_backdrop": "rgba(0, 0, 0, 0.9)" },
        }}
      />
    </div>
  );
}
