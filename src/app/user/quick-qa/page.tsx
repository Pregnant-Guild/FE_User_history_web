'use client';

import { useState } from 'react';

const faqData = [
  {
    id: 1,
    question: "1. Phần mềm này tương thích với những hệ điều hành nào?",
    answer: "Hệ thống tương thích hoàn toàn với Windows 10/11, macOS 12 trở lên. Đối với môi trường máy chủ, chúng tôi hỗ trợ các bản phân phối Linux phổ biến như Ubuntu và Debian."
  },
  {
    id: 2,
    question: "2. Sự khác biệt giữa phiên bản Miễn phí và Trả phí là gì?",
    answer: "Phiên bản trả phí cung cấp băng thông không giới hạn, hỗ trợ kỹ thuật ưu tiên 24/7, và quyền truy cập sớm vào các tính năng nâng cao. Bản miễn phí sẽ giới hạn một số tính năng xuất dữ liệu."
  },
  {
    id: 3,
    question: "3. Hệ thống hỗ trợ những phương thức kết nối nào?",
    answer: "Chúng tôi hỗ trợ kết nối qua REST API, WebSocket cho dữ liệu thời gian thực và cung cấp sẵn SDK cho các ngôn ngữ phổ biến như TypeScript, Go."
  },
  {
    id: 4,
    question: "4. Làm thế nào để tôi có thể tích hợp vào dự án Next.js hiện tại?",
    answer: "Bạn chỉ cần cài đặt package qua npm/yarn, thêm API Key vào file .env và gọi component Provider ở file layout.tsx gốc. Tài liệu chi tiết có sẵn trong mục Developer Docs."
  },
  {
    id: 5,
    question: "5. Dữ liệu của tôi được bảo mật như thế nào?",
    answer: "Toàn bộ dữ liệu được mã hóa đầu cuối (End-to-End Encryption). Chúng tôi tuân thủ nghiêm ngặt các tiêu chuẩn bảo mật quốc tế và thường xuyên rà soát hệ thống để phòng chống các lỗ hổng bảo mật."
  }
];

export default function Page() {
  // Lưu index của câu hỏi đang được mở. Mặc định mở câu đầu tiên (index 0).
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    // Nếu click lại vào câu đang mở thì đóng nó, ngược lại thì mở câu mới
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 py-16 px-4 sm:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-10">FAQs</h1>
        
        <div className="border-t border-slate-200">
          {faqData.map((faq, index) => {
            const isOpen = openIndex === index;
            
            return (
              <div key={faq.id} className="border-b border-slate-200">
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full py-6 flex justify-between items-center text-left focus:outline-none group"
                >
                  <span className="text-lg font-bold group-hover:text-indigo-600 transition-colors">
                    {faq.question}
                  </span>
                  <span className="text-3xl font-light ml-4 text-indigo-600 shrink-0 leading-none">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                
                {/* Phần nội dung có hiệu ứng trượt */}
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-96 opacity-100 pb-6' : 'max-h-0 opacity-0'
                  }`}
                >
                  <p className="text-slate-600 text-base leading-relaxed pr-8">
                    {faq.answer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}