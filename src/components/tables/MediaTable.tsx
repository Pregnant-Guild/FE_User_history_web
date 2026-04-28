"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import Badge from "../ui/badge/Badge";

export type MediaSortColumn =
  | "created_at"
  | "updated_at"
  | "size"
  | "original_name"
  | "mime_type";

export interface MediaItem {
  id: string;
  user_id: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  size: number;
  file_metadata: any;
  created_at: string;
  updated_at: string;
}

interface MediaTableProps {
  data: MediaItem[];
  onSort: (column: MediaSortColumn) => void;
  sortBy?: MediaSortColumn;
  sortOrder?: "asc" | "desc";
  // Các props mới thêm cho yêu cầu chọn, xem, xóa
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onViewSingle: (item: MediaItem, index: number) => void;
  onDeleteSingle: (id: string) => void;
}

export default function MediaTable({
  data,
  onSort,
  sortBy,
  sortOrder,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onViewSingle,
  onDeleteSingle,
}: MediaTableProps) {
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const SortIcon = ({ column }: { column: MediaSortColumn }) => {
    const isActive = sortBy === column;
    return (
      <div className="flex flex-col ml-2 opacity-50 cursor-pointer hover:opacity-100">
        <svg
          className={`w-3 h-3 ${isActive && sortOrder === "asc" ? "text-blue-700 opacity-100" : "text-gray-400"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
        </svg>
        <svg
          className={`w-3 h-3 -mt-1 ${isActive && sortOrder === "desc" ? "text-blue-700 opacity-100" : "text-gray-400"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    );
  };

  const getMimeTypeBadge = (mimeType: string) => {
    if (mimeType.includes("image")) {
      return (
        <Badge size="sm" variant="light" color="success">
          Hình ảnh
        </Badge>
      );
    }
    if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("document")) {
      return (
        <Badge size="sm" variant="light" color="warning">
          Tài liệu
        </Badge>
      );
    }
    return (
      <Badge size="sm" variant="light" color="light">
        Khác
      </Badge>
    );
  };

  const isAllSelected = data.length > 0 && selectedIds.length === data.length;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1000px]">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                <TableCell isHeader className="px-5 py-3 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => onToggleSelectAll(e.target.checked)}
                    className="w-4 h-4 text-brand-500 border-gray-300 rounded cursor-pointer focus:ring-brand-500 dark:bg-gray-800 dark:border-gray-600"
                  />
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  <div className="flex items-center cursor-pointer select-none" onClick={() => onSort("original_name")}>
                    Tên tệp <SortIcon column="original_name" />
                  </div>
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  <div className="flex items-center cursor-pointer select-none" onClick={() => onSort("mime_type")}>
                    Định dạng <SortIcon column="mime_type" />
                  </div>
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  <div className="flex items-center cursor-pointer select-none" onClick={() => onSort("size")}>
                    Kích thước <SortIcon column="size" />
                  </div>
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  <div className="flex items-center cursor-pointer select-none" onClick={() => onSort("created_at")}>
                    Ngày tải lên <SortIcon column="created_at" />
                  </div>
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                  <div className="flex items-center cursor-pointer select-none" onClick={() => onSort("updated_at")}>
                    Cập nhật <SortIcon column="updated_at" />
                  </div>
                </TableCell>
                <TableCell isHeader className="px-5 py-3 font-medium text-center text-gray-500 text-theme-xs dark:text-gray-400 min-w-[120px]">
                  Thao tác
                </TableCell>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {data.length > 0 ? (
                data.map((item, idx) => (
                  <TableRow
                    key={item.id}
                    className="hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-colors"
                  >
                    {/* Yêu cầu 1: Cột 0 - Ô hình vuông chọn từng item */}
                    <TableCell className="px-5 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => onToggleSelect(item.id)}
                        className="w-4 h-4 text-brand-500 border-gray-300 rounded cursor-pointer focus:ring-brand-500 dark:bg-gray-800 dark:border-gray-600"
                      />
                    </TableCell>
                    <TableCell className="px-5 py-4 text-start font-mono text-theme-xs truncate max-w-[250px]">
                      {item.original_name}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-start">
                      <div className="flex flex-col gap-1">
                        <div>{getMimeTypeBadge(item.mime_type)}</div>
                        <span className="text-[10px] text-gray-400">{item.mime_type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-start text-theme-sm font-medium">
                      {formatBytes(item.size)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-600 text-theme-sm dark:text-gray-400">
                      {formatDate(item.created_at)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-600 text-theme-sm dark:text-gray-400">
                      {formatDate(item.updated_at)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-4">
                        <button
                          onClick={() => onViewSingle(item, idx)}
                          className="text-brand-500 hover:text-brand-600 font-medium text-theme-sm"
                        >
                          Xem
                        </button>
                        <button
                          onClick={() => onDeleteSingle(item.id)}
                          className="text-red-500 hover:text-red-600 font-medium text-theme-sm"
                        >
                          Xóa
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="px-5 py-20 text-center text-gray-500 italic"
                  >
                    Không tìm thấy tệp tin nào
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