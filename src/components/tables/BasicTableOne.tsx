"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import Badge from "../ui/badge/Badge";
import Image from "next/image";
import { fullDataUser } from "@/interface/admin";

type SortColumn = "created_at" | "updated_at" | "display_name" | "email";

interface Role {
  id: string;
  name: string;
}

interface BasicTableOneProps {
  data: fullDataUser[];
  onSort: (column: SortColumn) => void;
  onViewDetail: (user: fullDataUser) => void;
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  onFilterRole?: (role: string) => void;
  selectedRole?: string;
  roles?: Role[];
}

export default function BasicTableOne({
  data,
  onSort,
  onViewDetail,
  sortBy,
  sortOrder,
  onFilterRole,
  selectedRole,
  roles = [],
}: BasicTableOneProps) {
  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
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

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1100px]">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 min-w-[265px] max-w-[265px]"
                >
                  <div
                    className="flex items-center cursor-pointer select-none"
                    onClick={() => onSort("display_name")}
                  >
                    Người dùng <SortIcon column="display_name" />
                  </div>
                </TableCell>

                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 min-w-[337px] max-w-[337px]"
                >
                  <div
                    className="flex items-center cursor-pointer select-none"
                    onClick={() => onSort("email")}
                  >
                    Email <SortIcon column="email" />
                  </div>
                </TableCell>

                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-start text-theme-xs min-w-[188px] max-w-[188px]"
                >
                  <div className="relative inline-flex items-center group">
                    <select
                      value={selectedRole}
                      onChange={(e) => onFilterRole?.(e.target.value)}
                      className="bg-transparent border-none outline-none cursor-pointer appearance-none text-gray-500 dark:text-gray-400 pr-5 hover:text-brand-500 transition-colors font-medium"
                    >
                      <option value="">Vai trò (Tất cả)</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <svg
                      className="w-3 h-3 absolute right-0 text-gray-400 pointer-events-none group-hover:text-brand-500"
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
                </TableCell>

                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Trạng thái
                </TableCell>

                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  <div
                    className="flex items-center cursor-pointer select-none"
                    onClick={() => onSort("created_at")}
                  >
                    Ngày tham gia <SortIcon column="created_at" />
                  </div>
                </TableCell>

                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  <div
                    className="flex items-center cursor-pointer select-none"
                    onClick={() => onSort("updated_at")}
                  >
                    Cập nhật <SortIcon column="updated_at" />
                  </div>
                </TableCell>

                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-center text-theme-xs dark:text-gray-400"
                >
                  Thao tác
                </TableCell>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {data.length > 0 ? (
                data.map((user) => (
                  <TableRow
                    key={user.id}
                    className="hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-colors"
                  >
                    <TableCell className="px-5 py-4 text-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 overflow-hidden rounded-full flex-shrink-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          {user.profile?.avatar_url ? (
                            <Image
                              width={40}
                              height={40}
                              src={user.profile.avatar_url}
                              alt="Avatar"
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <span className="font-bold text-brand-500 uppercase text-xs">
                              {user.profile?.display_name?.charAt(0) || "U"}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                            {user.profile?.display_name || "N/A"}
                          </span>
                          <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                            ID: {user.id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="px-5 py-4 text-gray-600 text-start text-theme-sm dark:text-gray-400">
                      {user.email}
                    </TableCell>

                    <TableCell className="px-5 py-4 text-start text-theme-sm">
                      <div className="flex flex-wrap gap-1">
                        {user.roles?.map((role) => (
                          <span
                            key={role.id}
                            className="px-2 py-0.5 rounded-md bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400 text-[10px] uppercase"
                          >
                            {role.name}
                          </span>
                        )) || (
                          <span className="text-gray-400 italic text-[10px]">
                            No Role
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="px-5 py-4 text-start">
                      <Badge
                        size="sm"
                        variant="light"
                        color={user.is_deleted ? "error" : "success"}
                      >
                        {user.is_deleted ? "Bị khóa" : "Hoạt động"}
                      </Badge>
                    </TableCell>

                    <TableCell className="px-5 py-4 text-gray-600 text-theme-sm dark:text-gray-400">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-gray-600 text-theme-sm dark:text-gray-400">
                      {formatDate(user.updated_at)}
                    </TableCell>

                    <TableCell className="px-5 py-4 text-center">
                      <button
                        onClick={() => onViewDetail(user)}
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
                    colSpan={7}
                    className="px-5 py-24 text-center text-gray-500 italic"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-theme-sm">
                        Không tìm thấy dữ liệu người dùng
                      </p>
                    </div>
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
