"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import Badge from "../ui/badge/Badge";
import { ApplicationDto } from "@/interface/historian";

export type AppSortColumn =
  | "created_at"
  | "status"
  | "verify_type"
  | "reviewed_at"
  | "reviewed_by"
  | "updated_at";

interface ApplicationTableProps {
  data: ApplicationDto[];
  onSort: (column: AppSortColumn) => void;
  onViewDetail: (app: ApplicationDto) => void;
  sortBy?: AppSortColumn;
  sortOrder?: "asc" | "desc";
}

export default function ApplicationTable({
  data,
  onSort,
  onViewDetail,
  sortBy,
  sortOrder,
}: ApplicationTableProps) {
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const SortIcon = ({ column }: { column: AppSortColumn }) => {
    const isActive = sortBy === column;
    return (
      <div className="flex flex-col ml-2 opacity-50 cursor-pointer hover:opacity-100">
        <svg
          className={`w-3 h-3 ${isActive && sortOrder === "asc" ? "text-blue-700 opacity-100" : "text-gray-400"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 15l7-7 7 7"
          />
        </svg>
        <svg
          className={`w-3 h-3 -mt-1 ${isActive && sortOrder === "desc" ? "text-blue-700 opacity-100" : "text-gray-400"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    );
  };

  const getStatusBadge = (status: string | number) => {
    const s = status?.toString();
    switch (s) {
      case "1":
      case "PENDING":
        return (
          <Badge size="sm" variant="light" color="warning">
            Đang chờ
          </Badge>
        );
      case "2":
      case "APPROVED":
        return (
          <Badge size="sm" variant="light" color="success">
            Đã duyệt
          </Badge>
        );
      case "3":
      case "REJECTED":
        return (
          <Badge size="sm" variant="light" color="error">
            Từ chối
          </Badge>
        );
      default:
        return (
          <Badge size="sm" variant="light" color="light">
            {status || "N/A"}
          </Badge>
        );
    }
  };

  const renderVerifyTypes = (
    verifyType: string | string[] | number | number[],
  ) => {
    const typeMap: Record<string, string> = {
      "1": "Thẻ nhận dạng nhà nghiên cứu",
      ID_CARD: "Thẻ nhận dạng nhà nghiên cứu",
      "2": "Bằng cấp",
      EDUCATION: "Bằng cấp",
      "3": "Chuyên gia",
      EXPERT: "Chuyên gia",
      "4": "Khác",
      OTHER: "Khác",
    };

    const typesArray = Array.isArray(verifyType) ? verifyType : [verifyType];

    return (
      <div className="flex flex-wrap gap-1">
        {typesArray.map((type, index) => {
          const t = type?.toString();
          if (!t) return null;
          return (
            <span
              key={index}
              className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 text-[11px] font-medium whitespace-nowrap"
            >
              {typeMap[t] || t}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1300px]">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Người gửi (ID)
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 min-w-[220px]"
                >
                  Loại xác minh
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Đính kèm
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  <div
                    className="flex items-center cursor-pointer select-none"
                    onClick={() => onSort("status")}
                  >
                    Trạng thái <SortIcon column="status" />
                  </div>
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  <div
                    className="flex items-center cursor-pointer select-none"
                    onClick={() => onSort("created_at")}
                  >
                    Ngày nộp <SortIcon column="created_at" />
                  </div>
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  <div
                    className="flex items-center cursor-pointer select-none"
                    onClick={() => onSort("reviewed_at")}
                  >
                    Cập nhật <SortIcon column="reviewed_at" />
                  </div>
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Cập nhật bởi
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 max-w-[200px]"
                >
                  Ghi chú
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-center text-gray-500 text-theme-xs dark:text-gray-400"
                >
                  Thao tác
                </TableCell>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {data.length > 0 ? (
                data.map((app) => (
                  <TableRow
                    key={app.id}
                    className="hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-colors"
                  >
                    <TableCell className="px-5 py-4 text-start font-mono text-theme-xs">
                      {app.user.display_name}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-start">
                      {renderVerifyTypes(app.verify_type)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-center text-theme-sm">
                      <span className="font-bold text-gray-800 dark:text-white mr-1">
                        {app.media?.length || 0}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-center ">
                      {getStatusBadge(app.status)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-600 text-theme-sm dark:text-gray-400">
                      {formatDate(app.created_at)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-600 text-theme-sm dark:text-gray-400">
                      {formatDate(app.reviewed_at)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-600 text-theme-sm dark:text-gray-400">
                      {app.reviewer?.display_name || "-"}
                    </TableCell>
                    <TableCell className="group relative px-5 pb-4 text-start text-theme-xs text-gray-500 dark:text-gray-400 max-w-50 min-w-50">
                      <div className="truncate">{app.review_note || "-"}</div>

                      {app.review_note && (
                        <div className="invisible group-hover:visible absolute z-50 bottom-full left-1/2 -translate-x-1/2 w-max max-w-75 p-2 backdrop-blur-xs text-black text-xs rounded-lg shadow-xl wrap-break-words whitespace-normal">
                          {app.review_note}
                          <div className="absolute top-full left-1/2  border-6 border-transparent border-t-white"></div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-center">
                      <button
                        onClick={() => onViewDetail(app)}
                        className="text-brand-500 hover:text-brand-600 font-medium text-theme-sm"
                      >
                        Chi tiết
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="px-5 py-20 text-center text-gray-500 italic"
                  >
                    Không tìm thấy dữ liệu hồ sơ
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
