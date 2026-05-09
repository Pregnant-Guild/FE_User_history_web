"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  const features = [
    {
      title: "Bản đồ dòng thời gian",
      desc: "Giao diện bản đồ tự động thay đổi biên giới, địa danh và sự kiện tương ứng với mốc thời gian được lựa chọn.",
      icon: "🗺️",
    },
    {
      title: "Tương tác thực tế",
      desc: "Hiển thị chi tiết bối cảnh, nhân vật và số liệu khi người dùng thao tác vào các điểm neo sự kiện trên bản đồ.",
      icon: "📍",
    },
    {
      title: "Trợ lý ảo & Công cụ học",
      desc: "Tích hợp AI giải đáp thắc mắc lịch sử, kết hợp hệ thống giao bài tập và làm Quiz trực tuyến cho học đường.",
      icon: "🤖",
    },
  ];

  const team = [
    { name: "Trần Anh Đức", role: "Project Manager", desc: "Đẹp trai cao m8",avatar: "/images/teamdev/tad.jpeg" },
    { name: "Đỗ Duy Khánh", role: "Backend Developer", desc: "Kì nhân dị sỹ",avatar: "/images/teamdev/ddk2.jpeg" },
    { name: "Ngô Cung Đức Anh", role: "Frontend Developer", desc: "Cũng đẹp trai nhưng cao m7 thôi",avatar: "/images/teamdev/ncda.jpeg" },
  ];

  return (
    // Sử dụng tông màu Vàng cổ (Parchment) và Xanh rêu (Dark Slate Green)
    <div className="relative min-h-screen w-full text-[#2D3A3A] font-sans selection:bg-[#A88B4C] selection:text-white overflow-x-hidden">
      
      {/* --- BACKGROUND IMAGE --- */}
      <div className="fixed inset-0 -z-20 pointer-events-none">
        <Image
          src="/images/map.jpeg"
          alt="World Map Background"
          fill
          className="object-cover object-center opacity-40"
          priority
        />
      </div>
      {/* Lớp overlay mờ để làm dịu background */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#FDFBF7]/80 via-[#FDFBF7]/70 to-[#FDFBF7]/90 -z-10 pointer-events-none"></div>

      {/* --- HEADER NAVBAR --- */}
      <header className="fixed top-0 w-full px-6 py-4 flex justify-between items-center backdrop-blur-sm bg-[#FDFBF7]/70 z-50 border-b border-[#A88B4C]/20">
        <div className="text-xl font-bold tracking-widest text-[#2D3A3A] uppercase">
          <span className="text-[#A88B4C]">Geo</span>History
        </div>
        <nav className="flex gap-4 items-center">
          <Link href="/auth/signin" className="text-sm font-semibold text-[#2D3A3A] hover:text-[#A88B4C] transition-colors">
            Đăng nhập
          </Link>
          <Link href="/user" className="text-sm font-semibold px-4 py-2 bg-[#2D3A3A] text-[#FDFBF7] rounded-lg hover:bg-[#1a2323] transition-colors">
            Vào Hệ thống
          </Link>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-32 pb-24 flex flex-col gap-32 w-full relative">
        
        {/* --- PHẦN 1: GIỚI THIỆU TỔNG QUAN --- */}
        <section className="min-h-[70vh] flex flex-col justify-center relative">
          <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tight mb-6">
            Bách khoa toàn thư <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#A88B4C] to-[#806835]">
              Bản đồ số Lịch sử
            </span>
          </h1>
          <div className="max-w-3xl space-y-6 text-lg md:text-xl text-[#4A5555] leading-relaxed">
            <p>
              Hệ thống thông tin địa lý (GIS) tiên phong trong việc trực quan hóa dữ liệu lịch sử. 
              Nền tảng của chúng tôi cho phép hiển thị động các thông tin như biên giới quốc gia, 
              diễn biến trận chiến và sự kiện theo đúng tiến trình thời gian.
            </p>
            <p>
              Đây là không gian tập trung tri thức được tinh lọc, nơi các chuyên gia, nhà sử học 
              và giáo viên đóng góp dữ liệu tọa độ, vector, được hệ thống kiểm duyệt chặt chẽ trước khi xuất bản.
            </p>
          </div>
          <div className="mt-10 flex gap-4">
            <Link href="#mission" className="px-8 py-4 bg-[#A88B4C] text-white font-bold rounded-xl shadow-lg shadow-[#A88B4C]/20 hover:bg-[#8e743c]">
              Khám phá sứ mệnh
            </Link>
          </div>
        </section>

        {/* --- PHẦN 2: SỨ MỆNH & CHỨC NĂNG --- */}
        <section id="mission" className="scroll-mt-24 relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            
            {/* Sứ mệnh */}
            <div>
              <div className="inline-block px-3 py-1 bg-[#A88B4C]/10 text-[#A88B4C] font-bold text-sm tracking-widest uppercase rounded-full mb-4 border border-[#A88B4C]/20">
                Sứ mệnh của chúng tôi
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Định hình lại cách học Lịch sử</h2>
              <div className="space-y-6 text-[#4A5555]">
                <div>
                  <h3 className="text-xl font-bold text-[#2D3A3A] mb-2 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-[#A88B4C]/20 flex items-center justify-center text-[#A88B4C]">1</span>
                    Giải quyết rào cản giáo dục
                  </h3>
                  <p>Khắc phục sự nhàm chán và khó tiếp cận của phương pháp học lịch sử truyền thống bằng cách biến dữ liệu chữ viết thành hình ảnh không gian, thời gian trực quan.</p>
                </div>
                <div className="w-full h-px bg-[#A88B4C]/20"></div>
                <div>
                  <h3 className="text-xl font-bold text-[#2D3A3A] mb-2 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-[#A88B4C]/20 flex items-center justify-center text-[#A88B4C]">2</span>
                    Tập trung hóa tri thức
                  </h3>
                  <p>Xây dựng một kho dữ liệu lịch sử thống nhất, chuẩn xác, phục vụ đa dạng đối tượng từ chính phủ, chuyên gia nghiên cứu đến học sinh, sinh viên và cộng đồng.</p>
                </div>
              </div>
            </div>

            {/* Chức năng */}
            <div>
              <div className="inline-block px-3 py-1 bg-[#2D3A3A]/10 text-[#2D3A3A] font-bold text-sm tracking-widest uppercase rounded-full mb-4 border border-[#2D3A3A]/20">
                Tính năng cốt lõi
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Công nghệ hội tụ</h2>
              <div className="flex flex-col gap-4">
                {features.map((feat, idx) => (
                  <div 
                    key={idx} 
                    className="flex gap-4 items-start p-5 hover:bg-[#A88B4C]/10 rounded-2xl group"
                  >
                    <div className="text-3xl bg-transparent w-14 h-14 rounded-xl flex items-center justify-center shrink-0">
                      {feat.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-[#2D3A3A] text-lg mb-1">{feat.title}</h4>
                      <p className="text-sm text-[#4A5555] leading-relaxed">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- PHẦN 3: ĐỘI NGŨ PHÁT TRIỂN --- */}
        <section className="relative">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-block px-3 py-1 bg-[#A88B4C]/10 text-[#A88B4C] font-bold text-sm tracking-widest uppercase rounded-full mb-4 border border-[#A88B4C]/20">
              Về chúng tôi
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Đội ngũ phát triển</h2>
            <p className="text-[#4A5555]">Những con người đam mê lịch sử và công nghệ chung tay xây dựng cỗ máy thời gian kỹ thuật số.</p>
          </div>
          
          <div className="flex mx-auto justify-center gap-12 flex-wrap">
            {team.map((member, i) => (
              <div key={i} className="p-6 text-center min-w-[264px]">
                <div className="w-24 h-24 mx-auto bg-gradient-to-tr from-[#A88B4C]/20 to-[#2D3A3A]/20 rounded-full mb-4 flex items-center justify-center">
                  <Image
                    src={member.avatar}
                    alt={member.name}
                    width={96}
                    height={96}
                    className="rounded-full object-cover object-center"
                  />
                </div>
                <h3 className="font-bold text-lg text-[#2D3A3A]">{member.name}</h3>
                <p className="text-xs font-bold text-[#A88B4C] uppercase tracking-wider my-2">{member.role}</p>
                <p className="text-sm text-[#4A5555]">{member.desc}</p>
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-[#A88B4C]/20 bg-[#2D3A3A] text-white py-12 text-center w-full mt-auto">
        <div className="max-w-6xl mx-auto px-6 flex flex-col items-center">
          <div className="text-2xl font-bold tracking-widest uppercase mb-4">
            <span className="text-[#A88B4C]">Geo</span>History
          </div>
          <p className="text-gray-400 text-sm mb-4 max-w-md">
            Bách khoa toàn thư bản đồ số lịch sử. Kết nối quá khứ, thấu hiểu hiện tại, kiến tạo tương lai.
          </p>
          <div className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} GeoHistory Project. All rights reserved.
          </div>
        </div>
      </footer>

    </div>
  );
}