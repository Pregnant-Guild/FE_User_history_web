"use client";
import React, { useState, useEffect } from "react";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import { UserMetaCardProps } from "@/interface/user";
import { useRouter } from "next/navigation";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { apiChangePassword } from "@/service/auth";
import { toast } from "sonner";

export default function AccountDetails({ data }: { data: UserMetaCardProps }) {
  const router = useRouter();
  const { isOpen, openModal, closeModal } = useModal();

  const [formValues, setFormValues] = useState({
    old_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setFormValues({
        old_password: "",
        new_password: "",
        confirm_password: "",
      });
      setShowOldPass(false);
      setShowNewPass(false);
      setShowConfirmPass(false);
      setError("");
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formValues.new_password !== formValues.confirm_password) {
      setError("Mật khẩu mới và xác nhận mật khẩu không khớp.");
      return;
    }

    if (formValues.new_password.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }

    try {
      const userId = data?.data?.id;

      if (userId) {
        const payload = {
          old_password: formValues.old_password,
          new_password: formValues.new_password,
        };

        await apiChangePassword(payload as any);
        closeModal();
        toast.success("Cập nhật thành công!");
        router.refresh();
      }
    } catch (err: any) {
      setError(
        `${err?.response?.data?.message}, Cập nhật thất bại, vui lòng kiểm tra lại thông tin. Mật khẩu tối thiểu 8 ký tự, 1 in hoa, 1 số và 1 ký tự đặc biệt.` ||
          "Failed to update password. Please check your current password.",
      );
      toast.error(
        err?.response?.data?.message ||
          "Cập nhật thất bại, vui lòng kiểm tra lại thông tin!",
      );
    }
  };
  const isPasswordMismatch =
    formValues.confirm_password.length > 0 &&
    formValues.new_password !== formValues.confirm_password;
  return (
    <>
      <div className="p-5 border border-red-200 rounded-2xl dark:border-gray-800 lg:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-6">
              Account Details
            </h4>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
              <div>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  Email Address
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {data?.data?.email || "example@mail.com"}
                </p>
              </div>
              <div>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  Password
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  ••••••••
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={openModal}
            className="flex items-center justify-center gap-2 rounded-full border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-600 hover:bg-gray-50 dark:border-red-700 dark:bg-red-800 dark:text-red-400 lg:inline-flex lg:w-auto"
          >
            <svg
              className="fill-current"
              width="18"
              height="18"
              viewBox="0 0 18 18"
            >
              <path d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z" />
            </svg>
            Edit
          </button>
        </div>
      </div>

      {/* Modal Chỉnh sửa */}
      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[700px] m-4">
        <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              Update Password
            </h4>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              For security, please enter your current password to set a new one.
            </p>
          </div>

          <form className="flex flex-col" onSubmit={handleSave}>
            <div className="px-2 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                {/* 1. Email (Disabled) */}
                <div className="col-span-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    defaultValue={data?.data?.email || ""}
                    disabled
                    className="bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>

                <div className="col-span-2 relative">
                  <Label>Current Password</Label>
                  <div className="relative">
                    <Input
                      type={showOldPass ? "text" : "password"}
                      name="old_password"
                      placeholder="Enter current password"
                      defaultValue={formValues.old_password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPass(!showOldPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showOldPass ? (
                        <EyeCloseIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="col-span-2 relative">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input
                      type={showNewPass ? "text" : "password"}
                      name="new_password"
                      placeholder="Enter new password"
                      defaultValue={formValues.new_password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showNewPass ? (
                        <EyeCloseIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="col-span-2 relative">
                  <Label>Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPass ? "text" : "password"}
                      name="confirm_password"
                      placeholder="Confirm new password"
                      defaultValue={formValues.confirm_password}
                      onChange={handleChange}
                      // Thêm class viền đỏ ở đây
                      className={
                        isPasswordMismatch
                          ? "border-red-500 focus:border-red-500 dark:border-red-500"
                          : ""
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showConfirmPass ? (
                        <EyeCloseIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  {/* Thêm một dòng text báo lỗi nhỏ ngay dưới ô input nếu muốn */}
                  {isPasswordMismatch && (
                    <p className="mt-1 text-xs text-red-500">
                      Mật khẩu không khớp!
                    </p>
                  )}
                </div>
              </div>

              {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
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
              <Button
                size="sm"
                type="submit"
                className="bg-red-500 hover:bg-red-600 "
              >
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
