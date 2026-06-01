'use client';

import { useState } from 'react';

const faqData = [
  {
    id: 1,
    question: "1. Tôi có thể đổi mật khẩu ở đâu?",
    answer: "Bạn có thể đổi mật khẩu ở mục Thông tin tài khoản ở góc dưới bên trái màn hình. Kéo xuống mục thay đổi mật khẩu và cập nhật thông tin."
  },
  {
    id: 2,
    question: "2. Làm sao để liên hệ với ban quản trị khi cần hỗ trợ gấp?",
    answer: "Bạn có thể liên hệ với ban quản trị qua email hoặc số điện thoại được cung cấp trong mục Liên hệ hỗ trợ"
  },
  {
    id: 3,
    question: "3. Để có thể làm kiểm duyệt viên tôi cần làm gì?",
    answer: "Bạn có thể gửi yêu cầu làm Nhà sử học bằng cách truy cập vào mục Nhà Sử Học ở góc dưới bên trái màn hình. Điền đầy đủ thông tin yêu cầu và gửi cho chúng tôi. Chúng tôi sẽ xem xét và liên hệ qua email."
  },
  {
    id: 4,
    question: "4. Thời gian phản hồi khi gửi yêu cầu là bao lâu?",
    answer: "Thông thường chúng tôi sẽ phản hồi yêu cầu của bạn trong vòng 24-48 giờ làm việc."
  },
  {
    id: 5,
    question: "5. Làm gì nếu tài khoản của tôi bị khóa?",
    answer: "Bạn có thể liên hệ với ban quản trị qua email hoặc số điện thoại được cung cấp trong mục Liên hệ hỗ trợ"
  },
];

export default function Page() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
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
