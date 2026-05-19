"use client";

import StickyHeader from "@/components/ui/StickyHeader";
import AccountDetails from "@/components/user-profile/AccountDetails";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import { UserMetaCardProps } from "@/interface/user";
import { apiGetCurrentUser } from "@/service/auth";
import { setUserData } from "@/store/features/userSlice";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";

export default function Profile() {
  const [user, setUser] = useState<UserMetaCardProps | null>(null);
  const [loading, setLoading] = useState(true);
  const dispatch = useDispatch();
  
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
  }, []);
  
  return (
    <div>
      <StickyHeader header={`Thông tin tài khoản`} />
      <div className="p-6 my-8 flex mx-auto ">
        <div className="max-w-82 pr-4 border-r border-gray-300">
          <UserMetaCard data={user ?? {}} />
          <UserInfoCard data={{ ...user, openEdit: true }} />
          <AccountDetails data={user ?? {}} />
        </div>
      </div>
    </div>
  );
}
