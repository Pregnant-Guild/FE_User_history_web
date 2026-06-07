"use client";

import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { apiGetCurrentUser } from "@/service/auth";
import { setUserData } from "@/store/features/userSlice";
import React, { useEffect } from "react";
import { useDispatch } from "react-redux";
import ChatbotWidget from "@/components/ui/chat/ChatbotWidget";
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </SidebarProvider>
    </ThemeProvider>
  );
}

function AdminLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const dispatch = useDispatch()

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await apiGetCurrentUser();
        dispatch(setUserData(userData.data));
      } catch (err) {
        console.error("Lỗi:", err);
      }
    };
    fetchUser();
  }, [dispatch])


  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "lg:ml-[290px]"
      : "lg:ml-[88px]";

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />
      <div
        className={`flex-1 transition-all  duration-300 ease-in-out ${mainContentMargin}`}
      >
        {/* <AppHeader /> */}
        <div className="mx-auto p-4 pt-0 max-w-[1240px]">{children}</div>
      </div>
      <ChatbotWidget />
    </div>
  );
}
