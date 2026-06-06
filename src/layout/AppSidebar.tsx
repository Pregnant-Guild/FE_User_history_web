"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  BoxCubeIcon,
  ChevronDownIcon,
  FileIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  ShootingStarIcon,
} from "../icons/index";

import { apiGetCurrentUser, apiLogout } from "@/service/auth";
import { UserMetaCardProps } from "@/interface/user";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: {
    name: string;
    path: string;
    pro?: boolean;
    new?: boolean;
  }[];
};

const ALL_NAV_ITEMS: NavItem[] = [
  { icon: <GridIcon />, name: "Trang Chủ", path: "/" },
  { icon: <BoxCubeIcon />, name: "Dự Án", path: "/user/projects" },
  { icon: <FileIcon />, name: "Thư Viện", path: "/user/library" },
];

const OTHERS_ITEMS: NavItem[] = [
  { icon: <ShootingStarIcon />, name: "Hỗ trợ", path: "/faq" },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const pathname = usePathname();
  const [user, setUser] = useState<UserMetaCardProps | null>(null);

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);
  
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => path === pathname, [pathname]);
  const isSidebarVisible = isExpanded || isMobileOpen;

  const handleToggle = () => {
    if (window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchUser = async () => {
      try {
        const userData = await apiGetCurrentUser();
        if (isMounted) setUser(userData);
      } catch (err) {
        console.error("Lỗi fetch user:", err);
      }
    };
    fetchUser();
    return () => {
      isMounted = false;
    };
  }, []);

  const clearAllCookies = () => {
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
  };

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await apiLogout();
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      clearAllCookies();
      window.location.href = "/signin";
    }
  };

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prev) =>
      prev?.type === menuType && prev?.index === index
        ? null
        : { type: menuType, index },
    );
  };

  // Tự động mở submenu nếu route hiện tại nằm trong subItems
  useEffect(() => {
    let submenuMatched = false;
    const menuGroups = [
      { items: ALL_NAV_ITEMS, type: "main" as const },
      { items: OTHERS_ITEMS, type: "others" as const },
    ];

    menuGroups.forEach(({ items, type }) => {
      items.forEach((nav, index) => {
        nav.subItems?.forEach((sub) => {
          if (isActive(sub.path)) {
            setOpenSubmenu((prev) => {
              if (prev?.type === type && prev?.index === index) return prev;
              return { type, index };
            });
            submenuMatched = true;
          }
        });
      });
    });

    if (!submenuMatched) {
      setOpenSubmenu((prev) => (prev !== null ? null : prev));
    }
  }, [pathname, isActive]);

  // Tính toán chiều cao cho hiệu ứng mượt mà của submenu
  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        requestAnimationFrame(() => {
          setSubMenuHeight((prev) => ({
            ...prev,
            [key]: subMenuRefs.current[key]?.scrollHeight || 0,
          }));
        });
      }
    }
  }, [openSubmenu]);

  const renderMenuItems = (items: NavItem[], menuType: "main" | "others") => (
    <ul className="flex flex-col gap-1.5">
      {items.map((nav, index) => {
        const isOpen = openSubmenu?.type === menuType && openSubmenu?.index === index;
        const refKey = `${menuType}-${index}`;

        return (
          <li key={nav.name}>
            {nav.subItems ? (
              <button
                onClick={() => handleSubmenuToggle(index, menuType)}
                className={`menu-item group capitalize ${
                  isOpen ? "menu-item-active" : "menu-item-icon-inactive"
                } ${!isExpanded ? "lg:justify-center px-2" : "lg:justify-start"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${isOpen ? "text-gray-900" : "text-gray-400"}`}>
                  {nav.icon}
                </span>
                {isSidebarVisible && (
                  <>
                    <span className="block truncate text-[14px] font-medium">
                      {nav.name}
                    </span>
                    <ChevronDownIcon
                      className={`ml-auto h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </button>
            ) : (
              nav.path && (
                <Link
                  href={nav.path}
                  className={`menu-item group ${
                    isActive(nav.path) ? "menu-item-active" : "menu-item-icon-inactive"
                  } ${!isExpanded ? "lg:justify-center px-2" : "lg:justify-start"}`}
                >
                  <span className={`menu-item-icon ${isActive(nav.path) ? "text-gray-950" : "text-gray-400"}`}>
                    {nav.icon}
                  </span>
                  {isSidebarVisible && (
                    <span className="block truncate text-[14px]">{nav.name}</span>
                  )}
                </Link>
              )
            )}

            {/* Submenu Area */}
            {nav.subItems && isSidebarVisible && (
              <div
                ref={(el) => {
                  subMenuRefs.current[refKey] = el;
                }}
                className="overflow-hidden ease-in-out transition-all duration-300"
                style={{
                  height: isOpen ? `${subMenuHeight[refKey] || 0}px` : "0px",
                }}
              >
                <ul className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-4">
                  {nav.subItems.map((subItem) => (
                    <li key={subItem.name}>
                      <Link
                        href={subItem.path}
                        className={`block rounded-xl py-2 text-[13px] transition-colors ${
                          isActive(subItem.path)
                            ? "font-medium text-gray-950"
                            : "text-gray-400 hover:text-gray-900"
                        }`}
                      >
                        {subItem.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white text-gray-900 will-change-[width]
    ${isSidebarVisible ? "w-[290px] px-5" : "w-0 border-none px-0 overflow-hidden sm:w-[88px] sm:border-solid sm:px-4"}
    ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 transition-all duration-300`}
    >
      {/* HEADER LOGO & TOGGLE */}
      <div
        className={`mb-2 flex w-full shrink-0 items-center ${
          !isSidebarVisible
            ? "h-auto flex-col justify-center gap-3 py-4"
            : "h-24 flex-row justify-between py-8"
        }`}
      >
        <Link href="/" className="flex shrink-0 items-center justify-center" aria-label="Go to homepage">
          <Image
            src="/images/logo/logo.svg"
            alt="Logo"
            width={isSidebarVisible ? 80 : 36}
            height={isSidebarVisible ? 45 : 36}
            priority
          />
        </Link>

        {isSidebarVisible && (
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white/80 text-gray-400 hover:bg-white"
            onClick={handleToggle}
            aria-label="Collapse Sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z" fill="currentColor" />
            </svg>
          </button>
        )}

        {!isSidebarVisible && (
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white/80 text-gray-400 hover:bg-white"
            onClick={handleToggle}
            aria-label="Expand Sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="rotate-180">
              <path fillRule="evenodd" clipRule="evenodd" d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>

      {/* USER PROFILE & NAVIGATION */}
      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto duration-200">
        <div className={`my-4 flex items-center gap-3 p-2 ${!isExpanded ? "justify-center px-2" : "rounded-4xl border border-gray-200"}`}>
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-white bg-gray-100 shadow-sm">
            <Image
              width={40}
              height={40}
              src={user?.data?.profile?.avatar_url || "/images/no-images.jpg"}
              alt="User"
              className="h-full w-full object-cover"
            />
          </div>
          {isSidebarVisible && (
            <div className="overflow-hidden">
              <span className="block truncate text-[14px] font-semibold text-gray-950">
                {user?.data?.profile?.display_name || "User"}
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-400">
                {user?.data?.email || "email"}
              </span>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-5">
          <div>
            <h2 className={`mb-3 flex text-[11px] font-bold capitalize tracking-wider text-gray-400/80 ${!isExpanded ? "lg:justify-center" : "justify-start pl-2"}`}>
              {isSidebarVisible ? "Menu" : <HorizontaLDots />}
            </h2>
            {renderMenuItems(ALL_NAV_ITEMS, "main")}
          </div>
          <div>
            <h2 className={`mb-3 flex text-[11px] font-bold capitalize tracking-wider text-gray-400/80 ${!isExpanded ? "lg:justify-center" : "justify-start pl-2"}`}>
              {isSidebarVisible ? "Others" : <HorizontaLDots />}
            </h2>
            {renderMenuItems(OTHERS_ITEMS, "others")}
          </div>
        </nav>
      </div>

      {/* FOOTER ACTIONS - Được đồng bộ style */}
      <div className="mt-auto shrink-0 border-t border-gray-200/50 py-4">
        <ul className="flex flex-col gap-1.5">
          <li>
            <Link
              href="/user"
              className={`menu-item group ${
                isActive("/user") ? "menu-item-active" : "menu-item-icon-inactive"
              } ${!isExpanded ? "lg:justify-center px-2" : "lg:justify-start"}`}
            >
              <span className={`menu-item-icon ${isActive("/user") ? "text-gray-950" : "text-gray-400"}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 14.1526 4.3002 16.1184 5.61936 17.616C6.17279 15.3096 8.24852 13.5955 10.7246 13.5955H13.2746C15.7509 13.5955 17.8268 15.31 18.38 17.6167C19.6996 16.119 20.5 14.153 20.5 12C20.5 7.30558 16.6944 3.5 12 3.5ZM17.0246 18.8566V18.8455C17.0246 16.7744 15.3457 15.0955 13.2746 15.0955H10.7246C8.65354 15.0955 6.97461 16.7744 6.97461 18.8455V18.856C8.38223 19.8895 10.1198 20.5 12 20.5C13.8798 20.5 15.6171 19.8898 17.0246 18.8566ZM2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM11.9991 7.25C10.8847 7.25 9.98126 8.15342 9.98126 9.26784C9.98126 10.3823 10.8847 11.2857 11.9991 11.2857C13.1135 11.2857 14.0169 10.3823 14.0169 9.26784C14.0169 8.15342 13.1135 7.25 11.9991 7.25ZM8.48126 9.26784C8.48126 7.32499 10.0563 5.75 11.9991 5.75C13.9419 5.75 15.5169 7.32499 15.5169 9.26784C15.5169 11.2107 13.9419 12.7857 11.9991 12.7857C10.0563 12.7857 8.48126 11.2107 8.48126 9.26784Z" fill="currentColor" />
                </svg>
              </span>
              {isSidebarVisible && <span className="block truncate text-[14px]">Tài Khoản</span>}
            </Link>
          </li>
          <li>
            <Link
              href="/user/role-upgrade"
              className={`menu-item group ${
                isActive("/user/role-upgrade") ? "menu-item-active" : "menu-item-icon-inactive"
              } ${!isExpanded ? "lg:justify-center px-2" : "lg:justify-start"}`}
            >
              <span className={`menu-item-icon ${isActive("/user/role-upgrade") ? "text-gray-950" : "text-gray-400"}`}>
                <ListIcon />
              </span>
              {isSidebarVisible && <span className="block truncate text-[14px]">Nhà Sử Học</span>}
            </Link>
          </li>
          <li>
            <Link
              href="/about-us"
              className={`menu-item group ${
                isActive("/about-us") ? "menu-item-active" : "menu-item-icon-inactive"
              } ${!isExpanded ? "lg:justify-center px-2" : "lg:justify-start"}`}
            >
              <span className={`menu-item-icon ${isActive("/about-us") ? "text-gray-950" : "text-gray-400"}`}>
                <ShootingStarIcon />
              </span>
              {isSidebarVisible && <span className="block truncate text-[14px]">Về chúng tôi</span>}
            </Link>
          </li>

          <li className="mt-2 border-t border-gray-200/40 pt-2">
            <button
              name="logout"
              onClick={handleLogout}
              className={`menu-item group w-full transition-all duration-200 hover:bg-red-50/50 ${
                !isExpanded ? "lg:justify-center px-2" : "lg:justify-start"
              }`}
            >
              <span className="menu-item-icon text-red-500">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M15.1007 19.247C14.6865 19.247 14.3507 18.9112 14.3507 18.497L14.3507 14.245H12.8507V18.497C12.8507 19.7396 13.8581 20.747 15.1007 20.747H18.5007C19.7434 20.747 20.7507 19.7396 20.7507 18.497L20.7507 5.49609C20.7507 4.25345 19.7433 3.24609 18.5007 3.24609H15.1007C13.8581 3.24609 12.8507 4.25345 12.8507 5.49609V9.74501L14.3507 9.74501V5.49609C14.3507 5.08188 14.6865 4.74609 15.1007 4.74609L18.5007 4.74609C18.9149 4.74609 19.2507 5.08188 19.2507 5.49609L19.2507 18.497C19.2507 18.9112 18.9149 19.247 18.5007 19.247H15.1007ZM3.25073 11.9984C3.25073 12.2144 3.34204 12.4091 3.48817 12.546L8.09483 17.1556C8.38763 17.4485 8.86251 17.4487 9.15549 17.1559C9.44848 16.8631 9.44863 16.3882 9.15583 16.0952L5.81116 12.7484L16.0007 12.7484C16.4149 12.7484 16.7507 12.4127 16.7507 11.9984C16.7507 11.5842 16.4149 11.2484 16.0007 11.2484L5.81528 11.2484L9.15585 7.90554C9.44864 7.61255 9.44847 7.13767 9.15547 6.84488C8.86248 6.55209 8.3876 6.55226 8.09481 6.84525L3.52309 11.4202C3.35673 11.5577 3.25073 11.7657 3.25073 11.9984Z" fill="currentColor" />
                </svg>
              </span>
              {isSidebarVisible && <span className="block truncate text-[14px] font-medium text-red-500">Đăng xuất</span>}
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
};

export default AppSidebar;