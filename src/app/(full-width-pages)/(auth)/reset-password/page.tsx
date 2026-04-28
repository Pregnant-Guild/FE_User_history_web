"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import { apiCreateOTP, apiVerifyOTP, apiResetPassword } from "@/service/auth";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export default function ResetPasswordForm() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidPassword = (pass: string) => {
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    return passwordRegex.test(pass);
  };

  const handleSendOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email.trim()) {
      setErrorMsg("Vui lòng nhập email.");
      return;
    }
    if (!isValidEmail(email)) {
      setErrorMsg("Email không đúng định dạng.");
      return;
    }

    try {
      setLoading(true);
      await apiCreateOTP(email);
      toast.success("Mã OTP đã được gửi đến email của bạn!");
      setStep(2);
    } catch (error) {
      setErrorMsg("Lỗi khi gửi OTP. Vui lòng kiểm tra lại email.");
      toast.error("Gửi OTP thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");

    if (!otp.trim()) {
      setErrorMsg("Vui lòng nhập mã OTP.");
      return;
    }
    if (!isValidPassword(newPassword)) {
      setErrorMsg("Mật khẩu chưa đủ điều kiện bảo mật.");
      return;
    }

    try {
      setLoading(true);

      const verifyRes = await apiVerifyOTP(email, otp);
      const tokenId = verifyRes?.data?.token_id;
      
      if (!tokenId) {
        throw new Error("OTP không hợp lệ hoặc đã hết hạn.");
      }

      const resetPayload = {
        email: email,
        new_password: newPassword,
        token_id: tokenId,
      };

      await apiResetPassword(resetPayload);
      
      toast.success("Đổi mật khẩu thành công!");
      window.location.href = "/signin";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Đổi mật khẩu thất bại.";
      setErrorMsg(errorMessage);
      console.error("Reset password error:", error);
      toast.error("Vui lòng kiểm tra lại mã OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full lg:w-1/2 overflow-y-auto no-scrollbar">
      <div className="w-full max-w-md mx-auto mb-5 sm:pt-10">
        <Link
          href="/signin"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          Back to Sign In
        </Link>
      </div>

      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {step === 1 ? "Forgot Password" : "Set New Password"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {step === 1
                ? "Enter your email address to receive an OTP code."
                : `We sent an OTP to ${email}. Please enter it along with your new password.`}
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 mb-4 text-sm rounded text-error-500 bg-error-50 dark:bg-error-500/10">
              {errorMsg}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleSendOtp}>
              <div className="space-y-5">
                <div>
                  <Label>
                    Email <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    name="email"
                    defaultValue={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMsg("");
                    }}
                    placeholder="Enter your registered email"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className={`flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-white transition rounded-lg shadow-theme-xs 
                      ${loading || !email.trim() ? "bg-gray-400 cursor-not-allowed" : "bg-brand-500 hover:bg-brand-600"}`}
                  >
                    {loading ? "Sending OTP..." : "Send Reset Code"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleResetPassword}>
              <div className="space-y-5">
                <div>
                  <Label>
                    OTP Code <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    name="otp"
                    defaultValue={otp}
                    onChange={(e) => {
                      setOtp(e.target.value);
                      setErrorMsg("");
                    }}
                    placeholder="Enter the 6-digit code"
                  />
                </div>

                <div>
                  <Label>
                    New Password <span className="text-error-500">*</span>
                  </Label>
                  <div
                    className={`relative ${newPassword.length > 0 && !isValidPassword(newPassword) ? "border border-red-500 ring-1 ring-red-500 rounded-lg" : ""}`}
                  >
                    <Input
                      name="newPassword"
                      defaultValue={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setErrorMsg("");
                      }}
                      placeholder="Min. 8 characters"
                      type={showPassword ? "text" : "password"}
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? <EyeIcon /> : <EyeCloseIcon />}
                    </span>
                  </div>

                  <p
                    className={`mt-2 text-xs ${newPassword.length === 0 ? "text-gray-400" : isValidPassword(newPassword) ? "text-green-500" : "text-red-500"}`}
                  >
                    Mật khẩu phải chứa tối thiểu 8 ký tự, 1 chữ cái in hoa, 1 chữ số và 1 ký tự đặc biệt.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center justify-center w-1/3 px-4 py-3 text-sm font-medium text-gray-700 transition bg-gray-200 rounded-lg hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !isValidPassword(newPassword)}
                    className={`flex items-center justify-center w-2/3 px-4 py-3 text-sm font-medium text-white transition rounded-lg shadow-theme-xs 
                      ${loading || !isValidPassword(newPassword) ? "bg-brand-400 opacity-70 cursor-not-allowed" : "bg-brand-500 hover:bg-brand-600"}`}
                  >
                    {loading ? "Resetting..." : "Reset Password"}
                  </button>
                </div>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}