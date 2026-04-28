'use client'; 

import { useState, useEffect } from 'react';
import { apiGetCurrentUser } from "@/service/auth";

export default function GetUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true);
        const result = await apiGetCurrentUser();
        // console.log("Current User from useEffect:", result);
        setUser(result);
      } catch (err) {
        // console.error("Lỗi 401 hoặc lỗi kết nối:", err);
        // setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []); 

  if (loading) return <div>Đang tải thông tin...</div>;
  if (error) return <div>Bạn chưa đăng nhập (Lỗi 401)</div>;

  return (
    <div className="">
      <h1>Thông tin người dùng hiện tại:</h1>
    </div>
  );
}