"use client";

import AccountDetails from "@/components/user-profile/AccountDetails";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import { UserMetaCardProps } from "@/interface/user";
import { apiGetCurrentUser } from "@/service/auth";
import { setUserData } from "@/store/features/userSlice";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store/store";
import StickyHeader from "@/components/ui/StickyHeader";
import { SafeHTMLRenderer } from "@/components/ui/parse/SafeHTMLRenderer";
import { apiGetCurrentUserApplications } from "@/service/userService";
import Loading from "@/app/loading";

export default function Profile() {
  const currentUser = useSelector((state: RootState) => state.user.data);
  const dispatch = useDispatch();

  const [application, setApplication] = useState<any>(null);
  const [appLoading, setAppLoading] = useState(false);

  const isHistorian = !!currentUser?.roles?.some(
    (role: any) => role.name === "HISTORIAN"
  );

  // Background refresh of user data to ensure eventual consistency
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
  }, [dispatch]);

  // Fetch applications in parallel immediately if user is a historian
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

  if (!currentUser) {
    return <Loading />;
  }

  const userMetaProps: UserMetaCardProps = {
    data: currentUser
      ? {
          id: currentUser.id,
          email: currentUser.email,
          profile: currentUser.profile,
          roles: currentUser.roles?.map((role) => ({
            id: Number(role.id) || undefined,
            name: role.name,
          })),
        }
      : undefined,
    status: true,
  };

  // Nếu người dùng có role là HISTORIAN
  if (isHistorian) {
    return (
      <div>
        <StickyHeader header={`Thông tin tài khoản`} />
        <div className="md:px-12 flex flex-col md:flex-row mx-auto gap-6 w-full max-w-7xl items-start">
          <div className="w-full md:max-w-72 xl:max-w-82 pr-0 md:pr-4 border-b md:border-b-0 md:border-r border-gray-300 pb-6 md:pb-0 shrink-0 space-y-6">
            <UserMetaCard data={userMetaProps} />
            <UserInfoCard data={{ ...userMetaProps, openEdit: true }} />
            <AccountDetails data={userMetaProps} />
          </div>

          <div className="flex-1 min-w-0 w-full">
            {appLoading ? (
              <div className="flex items-center justify-center p-20 w-full bg-zinc-50/50 dark:bg-zinc-950/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div className="w-8 h-8 border-4 border-zinc-200 border-t-blue-600 rounded-full animate-spin"></div>
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
          <UserMetaCard data={userMetaProps} />
          <UserInfoCard data={{ ...userMetaProps, openEdit: true }} />
          <AccountDetails data={userMetaProps} />
        </div>
      </div>
    </div>
  );
}
