"use client";

import { setSelectedApplication } from "@/store/features/userSlice";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { URL_MEDIA } from "../../../api";
import { statusConfig } from "@/service/handler";

const formatFullDateTime = (dateString: string) => {
  const date = new Date(dateString);
  const time = date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${time} ${day}`;
};

const processMedia = (mediaArray: any[]) => {
  if (!mediaArray || mediaArray.length === 0) return { type: "empty" };
  const imageFiles = mediaArray.filter((file) => {
    const isImageMime = file.mime_type?.startsWith("image/");
    const isImageExt = /\.(jpg|jpeg|png|webp|gif)$/i.test(file.storage_key);
    return isImageMime || isImageExt;
  });
  const docFiles = mediaArray.filter((file) => {
    const isImage =
      file.mime_type?.startsWith("image/") ||
      /\.(jpg|jpeg|png|webp|gif)$/i.test(file.storage_key);
    return !isImage;
  });
  if (imageFiles.length > 0)
    return { type: "image", src: `${URL_MEDIA}${imageFiles[0].storage_key}` };
  if (docFiles.length > 0) {
    const extensions = docFiles.map((file) =>
      file.mime_type
        ? file.mime_type.split("/")[1]
        : file.storage_key.split(".").pop() || "file",
    );
    return { type: "documents", extensions };
  }
  return { type: "empty" };
};

export default function ApplicationList({
  applications,
}: {
  applications: any[];
}) {
  const router = useRouter();
  const dispatch = useDispatch();

  const handleViewDetail = (app: any) => {
    dispatch(setSelectedApplication(app));
    router.push(`/account/applications`);
  };

  const StatusIcons: Record<string, React.ReactNode> = {
    APPROVED: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        stroke="currentColor"
        className="size-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
    PENDING: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        stroke="currentColor"
        className="size-6 animate-pulse p-1 "
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"
        />
      </svg>
    ),
    REJECTED: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        stroke="currentColor"
        className="size-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6  dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-5 dark:border-zinc-800">
        <h3 className="text-xl font-bold text-gray-800 dark:text-white/90">
          Hồ sơ{" "}
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({applications.length} tệp)
          </span>
        </h3>
        {/* <div className="text-sm text-gray-500">
          Cập nhật lần cuối: {new Date().toLocaleDateString("vi-VN")}
        </div> */}
      </div>

      {/* CHỈ SỬA DÒNG NÀY: Tăng số lượng cột (grid-cols) để các thẻ nhỏ lại */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {applications?.map((app) => {
          const mediaState = processMedia(app.media);
          const config = statusConfig[app.status] || statusConfig.PENDING;

          return (
            <div
              key={app.id}
              onClick={() => handleViewDetail(app)}
              className="group relative flex aspect-square w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50  transition-all duration-300  hover:ring-2 hover:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <div className="absolute inset-0 z-0">
                {mediaState.type === "image" ? (
                  <img
                    src={mediaState.src}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-100 p-4 dark:bg-zinc-800/80">
                    {mediaState.type === "documents" ? (
                      <div className="flex flex-wrap justify-center gap-2">
                        {mediaState.extensions?.slice(0, 3).map((ext, i) => (
                          <span
                            key={i}
                            className="rounded bg-white px-2 py-1 text-xs font-bold uppercase text-gray-600  border border-gray-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-gray-200"
                          >
                            .{ext}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-200 to-gray-300 opacity-50 dark:from-zinc-600 dark:to-zinc-800" />
                    )}
                  </div>
                )}
              </div>

              <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100" />

              <div className="absolute left-3 right-3 top-3 z-20 flex items-start justify-between">
                {app.media?.length > 0 ? (
                  <span className="rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold tracking-wider text-white backdrop-blur-md">
                    {app.media.length} TỆP
                  </span>
                ) : (
                  <div />
                )}
                <div className={`${config.container} rounded-full `}>
                  {StatusIcons[app.status] || StatusIcons.PENDING}
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 z-20 p-4 text-white">
                <p className="mb-1 truncate text-xs font-bold uppercase tracking-wider text-gray-300">
                  {app.verify_type || "VERIFY"}
                </p>

                {app?.reviewer?.display_name && (
                  <p className="mb-3 truncate text-sm font-medium text-blue-300">
                    Người duyệt: {app.reviewer.display_name}
                  </p>
                )}

                <div className="flex items-center justify-between border-t border-white/20 pt-2">
                  <p className="text-xs font-semibold text-gray-300">
                    {formatFullDateTime(app.created_at)}
                  </p>

                  <div className="flex h-6 w-6 -translate-x-2 items-center justify-center rounded-full bg-white/20 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                    <svg
                      className="h-3 w-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}