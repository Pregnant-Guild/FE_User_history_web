"use client";

import AccountDetails from "@/components/user-profile/AccountDetails";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import { UserMetaCardProps } from "@/interface/user";
import { apiGetCurrentUser } from "@/service/auth";
import { setUserData } from "@/store/features/userSlice";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import StickyHeader from "@/components/ui/StickyHeader";
import { SafeHTMLRenderer } from "@/components/ui/parse/SafeHTMLRenderer";
import { apiGetCurrentUserApplications } from "@/service/userService";
import Loading from "@/app/loading";

export default function Profile() {
  const [user, setUser] = useState<UserMetaCardProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<any>(null);
  const [appLoading, setAppLoading] = useState(false);
  const dispatch = useDispatch();

  const isHistorian = !!user?.data?.roles?.some(
    (role: any) => role.name === "HISTORIAN"
  );

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await apiGetCurrentUser();
        dispatch(setUserData(userData.data));
        setUser(userData);
      } catch (err) {
        console.error("Lỗi:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [dispatch]);

  useEffect(() => {
    if (isHistorian) {
      const fetchApp = async () => {
        try {
          setAppLoading(true);
          const res = await apiGetCurrentUserApplications();
          if (res?.data) {
            const approvedApp =
              res.data.find((app: any) => app.status === "APPROVED") ||
              res.data[0];
            setApplication(approvedApp);
          }
        } catch (err) {
          console.error("Lỗi khi tải hồ sơ nhà sử học:", err);
        } finally {
          setAppLoading(false);
        }
      };
      fetchApp();
    }
  }, [isHistorian]);

  if (loading) {
    return (
      <Loading/>
    );
  }

  // Nếu người dùng có role là HISTORIAN
  if (isHistorian) {
    return (
      <div>
        <StickyHeader header={`Thông tin tài khoản`} />
        <div className="md:px-12 flex flex-col md:flex-row mx-auto gap-6 w-full max-w-7xl items-start">
          <div className="w-full md:max-w-72 xl:max-w-82 pr-0 md:pr-4 border-b md:border-b-0 md:border-r border-gray-300 pb-6 md:pb-0 shrink-0 space-y-6">
            <UserMetaCard data={user ?? {}} />
            <UserInfoCard data={{ ...user, openEdit: true }} />
            <AccountDetails data={user ?? {}} />
          </div>

          <div className="flex-1 min-w-0 w-full">
            {appLoading ? (
              <div>
                <Loading/>
              </div>
            ) : application ? (
              <div className="">
                <SafeHTMLRenderer html={application.content} />
              </div>
            ) : (
              <div className="p-10 text-center text-zinc-500 font-medium bg-zinc-50/50 dark:bg-zinc-950/30 rounded-2xl border-2 border-zinc-50 dark:border-zinc-800">
                Không tìm thấy thông tin hồ sơ nhà sử học.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 mt-[100px]">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          Thông tin tài khoản
        </h3>
        <div className="space-y-6">
          <UserMetaCard data={user ?? {}} />
          <UserInfoCard data={{ ...user, openEdit: true }} />
          <AccountDetails data={user ?? {}} />
        </div>
      </div>
    </div>
  );
}
