"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import RichTextEditor from "@/components/form/role-upgrade/Editor";
import {
  confirmUpload,
  getPresignedUrl,
  uploadFileToS3,
} from "@/service/mediaService";
import React, { useRef, useState } from "react";
import Image from "next/image";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import { createHistorianCV } from "@/service/historianService";
import { toast } from "sonner";
import Swal from "sweetalert2";

type PendingFile = {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  type: "image" | "document";
  extension: string;
  presigned?: any;
};

export default function RoleUpgrade() {
  const [content, setContent] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifyType, setVerifyType] = useState<string>("OTHER");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleIframeLoad = () => {
    const iframe = iframeRef.current;

    if (!iframe || !iframe.contentDocument) return;

    const updateHeight = () => {
      if (iframe.contentDocument) {
        iframe.style.height = "auto";
        const scrollHeight =
          iframe.contentDocument.documentElement.scrollHeight;
        iframe.style.height = `${scrollHeight}px`;
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    if (iframe.contentDocument.body) {
      resizeObserver.observe(iframe.contentDocument.body);
    }
  };

  const cleanHTMLContent = (rawHtml: string) => {
    if (!rawHtml) return "";

    const doc = new DOMParser().parseFromString(rawHtml, "text/html");
    let decoded = doc.documentElement.textContent || rawHtml;

    decoded = decoded.replace(/<pre[^>]*>/g, "").replace(/<\/pre>/g, "");

    return decoded;
  };

  const handleContentChange = (value: string) => {
    setContent(value);
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsPreparingFiles(true);
    try {
      const newFilesPromises = Array.from(files).map(async (file) => {
        const isImage = file.type.startsWith("image/");
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        const presigned = await getPresignedUrl(file);

        return {
          id: Math.random().toString(36).substring(7),
          file: file,
          previewUrl: isImage ? URL.createObjectURL(file) : "",
          name: file.name,
          size: file.size,
          type: isImage ? "image" : "document",
          extension: extension,
          presigned: presigned,
        } as PendingFile;
      });

      const newPendingFiles = await Promise.all(newFilesPromises);
      setPendingFiles((prev) => [...prev, ...newPendingFiles]);
    } catch (error) {
      console.error("Lỗi khi chuẩn bị file:", error);
      toast.error("Lỗi khi chuẩn bị kết nối upload.");
    } finally {
      setIsPreparingFiles(false);
      if (event.target) event.target.value = "";
    }
  };

  const removePendingFile = (idToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingFiles((prev) => prev.filter((item) => item.id !== idToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.warning("Vui lòng nhập nội dung hồ sơ!");
      return;
    }

    try {
      setIsSubmitting(true);

      const uploadPromises = pendingFiles.map(async (item) => {
        await uploadFileToS3(item.file, item.presigned);
        const confirmRes = await confirmUpload(item.presigned.token_id);
        return confirmRes?.data?.id || confirmRes?.id;
      });
      const uploadedMediaIds = await Promise.all(uploadPromises);

      const cleanPayloadContent = cleanHTMLContent(content);

      const payload = {
        content: cleanPayloadContent,
        media_ids: uploadedMediaIds,
        verify_type: verifyType,
      };

      await createHistorianCV(payload);

      Swal.fire({
        title: "Gửi yêu cầu thành công!",
        text: "Hồ sơ của bạn đã được ghi nhận và đang chờ duyệt.",
        icon: "success",
      });

      setContent("");
      setPendingFiles([]);
      setVerifyType("OTHER");
    } catch (error) {
      console.error("Lỗi submit:", error);
      toast.error("Có lỗi xảy ra khi gửi yêu cầu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const imageFiles = pendingFiles.filter((f) => f.type === "image");
  const slides = imageFiles.map((item) => ({
    src: item.previewUrl,
    title: item.name,
    description: `Size: ${(item.size / 1024).toFixed(2)} KB`,
  }));

  const handleItemClick = (item: PendingFile) => {
    if (item.type === "image") {
      const index = imageFiles.findIndex((img) => img.id === item.id);
      setLightboxIndex(index);
    } else {
      const fileUrl = URL.createObjectURL(item.file);
      window.open(fileUrl, "_blank");
    }
  };

  const getDocumentStyle = (ext: string) => {
    if (["pdf"].includes(ext))
      return { color: "text-red-500", bg: "bg-red-50" };
    if (["doc", "docx"].includes(ext))
      return { color: "text-blue-500", bg: "bg-blue-50" };
    if (["xls", "xlsx"].includes(ext))
      return { color: "text-emerald-500", bg: "bg-emerald-50" };
    return { color: "text-gray-500", bg: "bg-gray-100" };
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <PageBreadcrumb pageTitle="Đăng ký trở thành Nhà sử học" />

      <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-2 rounded-xl border border-gray-200 dark:border-gray-800 mb-6">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${!showPreview ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
          >
            Soạn thảo
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${showPreview ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
          >
            Xem trước giao diện
          </button>
        </div>
        <span className="text-[10px] font-black uppercase text-gray-400 mr-2 tracking-widest">
          {showPreview ? "Preview Mode" : "Edit Mode"}
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <div className="relative min-h-[400px]">
          {!showPreview ? (
            <RichTextEditor value={content} onChange={handleContentChange} />
          ) : (
            <div className="bg-white border border-zinc-200 rounded-xl shadow-inner overflow-hidden min-h-[400px]">
              {content ? (
                <iframe
                  ref={iframeRef}
                  onLoad={handleIframeLoad}
                  srcDoc={`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <meta charset="utf-8">
                          <style>
                            body { 
                              font-family: system-ui, sans-serif; 
                              padding: 20px; 
                              margin: 0; 
                              color: black;
                              overflow-y: hidden;
                            }
                            img { max-width: 100%; height: auto; display: block; margin-top: 10px; }
                          </style>
                        </head>
                        <body>
                          ${cleanHTMLContent(content)}
                        </body>
                      </html>
                    `}
                  title="Preview"
                  className="w-full border-none flex-1 transition-all duration-300"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-[400px] text-zinc-400 italic bg-gray-50 dark:bg-gray-900">
                  <p>Chưa có nội dung để xem trước</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 bg-white border border-gray-200 rounded-2xl dark:border-gray-800 dark:bg-gray-900">
          <label className="block mb-3 text-sm font-semibold text-gray-700 dark:text-white">
            Loại hồ sơ xác minh <span className="text-red-500">*</span>
          </label>
          <select
            value={verifyType}
            onChange={(e) => setVerifyType(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="OTHER">Tài liệu khác (Other)</option>
            <option value="ID_CARD">Thẻ nhận dạng (ID Card)</option>
            <option value="EDUCATION">Bằng cấp giáo dục (Education)</option>
            <option value="EXPERT">Chứng nhận chuyên gia (Expert)</option>
          </select>
        </div>

        {/* Upload Files */}
        <div className="p-5 bg-white border border-gray-200 rounded-2xl dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Tài liệu đính kèm</h3>
            <label className="cursor-pointer px-4 py-2 rounded-lg border border-dashed border-blue-500 text-blue-500 hover:bg-blue-50 transition">
              <input
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.doc,.docx"
                onChange={handleFileChange}
              />
              <span>+ Thêm tệp</span>
            </label>
          </div>

          {pendingFiles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {pendingFiles.map((item) => {
                const docStyle = getDocumentStyle(item.extension);
                return (
                  <div
                    key={item.id}
                    className="relative group aspect-square border rounded-xl overflow-hidden bg-gray-50"
                  >
                    {item.type === "image" ? (
                      <Image
                        src={item.previewUrl}
                        alt="preview"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div
                        className={`flex flex-col items-center justify-center h-full ${docStyle.bg} p-2`}
                      >
                        <span className={`text-xs font-bold ${docStyle.color}`}>
                          {item.extension.toUpperCase()}
                        </span>
                        <span className="text-[10px] truncate w-full text-center mt-1">
                          {item.name}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={(e) => removePendingFile(item.id, e)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || isPreparingFiles}
          className={`w-full py-4 text-white font-bold rounded-2xl shadow-lg transition-all ${isSubmitting || isPreparingFiles ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {isSubmitting ? "Đang xử lý..." : "Gửi yêu cầu nâng cấp"}
        </button>
      </div>

      <Lightbox
        index={lightboxIndex}
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        slides={slides}
        plugins={[Zoom, Captions]}
      />
    </div>
  );
}
