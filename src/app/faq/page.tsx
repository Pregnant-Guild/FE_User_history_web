'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

type GuideSection = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
};

const guideSections: GuideSection[] = [
  {
    id: 'start',
    title: 'Bắt đầu xem bản đồ',
    summary: 'Route / là màn bản đồ lịch sử tương tác. Người dùng có thể xem dữ liệu theo năm, chọn lớp hiển thị, mở wiki và phát replay sự kiện.',
    steps: [
      'Khi vào trang chủ, chờ bản đồ tải xong hoặc nhấn vào màn hình chờ để vào nhanh hơn.',
      'Dùng chuột để kéo bản đồ, cuộn để phóng to/thu nhỏ. Trên điện thoại, dùng một ngón để kéo và hai ngón để phóng to/thu nhỏ bản đồ.',
      'Các vùng, đường, điểm hoặc biểu tượng trên bản đồ là dữ liệu lịch sử. Nhấn vào một đối tượng để xem thông tin liên quan.',
      'Nếu bản đồ đang tải dữ liệu theo năm, chờ vài giây để các lớp lịch sử cập nhật.'
    ],
  },
  {
    id: 'timeline',
    title: 'Dùng thanh thời gian',
    summary: 'Thanh thời gian ở cạnh dưới dùng để chuyển bản đồ về một mốc năm cụ thể.',
    steps: [
      'Kéo thước timeline để đổi năm nhanh.',
      'Nhập trực tiếp năm vào ô số nếu đã biết mốc cần xem.',
      'Nhấn nút - hoặc + để giảm/tăng từng năm. Giữ nút để chạy liên tục.',
      'Bật lọc timeline để chỉ ưu tiên dữ liệu phù hợp với năm đang chọn. Tắt lọc nếu muốn xem nhiều dữ liệu hơn cùng lúc.',
      'Trên màn hình desktop có ô Range. Tăng Range nếu muốn mở rộng khoảng năm gần mốc đang chọn, ví dụ xem thêm dữ liệu trong vài năm lân cận.'
    ],
  },
  {
    id: 'search',
    title: 'Tìm địa danh và dữ liệu lịch sử',
    summary: 'Ô tìm kiếm giúp đi nhanh tới địa danh hiện tại, wiki hoặc geometry lịch sử.',
    steps: [
      'Nhập tên địa danh, nhân vật, sự kiện hoặc thực thể lịch sử vào ô tìm kiếm phía trên bản đồ.',
      'Chọn kết quả phù hợp để bản đồ tự di chuyển tới vị trí liên quan.',
      'Nếu kết quả là địa danh hiện tại, bản đồ sẽ focus tới tọa độ hiện nay.',
      'Nếu kết quả có geometry lịch sử, hệ thống sẽ chọn đối tượng đó và có thể tự đổi timeline về năm bắt đầu của dữ liệu.'
    ],
  },
  {
    id: 'layers',
    title: 'Bật/tắt lớp bản đồ',
    summary: 'Bảng lớp nằm bên trái, dùng để kiểm soát nền bản đồ và loại dữ liệu lịch sử đang hiển thị.',
    steps: [
      'Dùng nhóm lớp nền để đổi hoặc ẩn/hiện các nền như bản đồ cơ sở, vệ tinh hoặc các lớp tham chiếu.',
      'Dùng nhóm geometry để bật/tắt từng loại dữ liệu như quốc gia, vùng, thành phố, tuyến đường, trận đánh, cảng, đền, pháo đài.',
      'Nếu bản đồ quá nhiều chi tiết, hãy tắt bớt loại geometry chưa cần xem.',
      'Có thể ẩn bảng lớp để mở rộng diện tích bản đồ. Mở menu tròn bên trái rồi nhấn nút hiện bảng lớp để bật lại.'
    ],
  },
  {
    id: 'wiki',
    title: 'Mở wiki từ bản đồ',
    summary: 'Khi chọn một đối tượng lịch sử, panel bên phải hoặc phía dưới trên mobile sẽ hiển thị thông tin wiki liên quan.',
    steps: [
      'Nhấn vào vùng, điểm hoặc đường trên bản đồ để chọn đối tượng.',
      'Nếu đối tượng có nhiều wiki liên quan, chọn bài viết phù hợp trong danh sách.',
      'Trong nội dung wiki, nhấn các liên kết nội bộ để mở bài khác. Nếu bài đó có nhiều geometry, chọn geometry muốn focus.',
      'Kéo cạnh panel để đổi kích thước trên desktop. Trên mobile, panel nằm phía dưới và có thể điều chỉnh chiều cao.',
      'Nhấn nút đóng trong panel để quay lại chế độ xem bản đồ rộng hơn.'
    ],
  },
  {
    id: 'replay',
    title: 'Xem replay diễn biến lịch sử',
    summary: 'Replay mô phỏng các bước diễn biến của một sự kiện hoặc trận đánh khi dữ liệu đó có kịch bản.',
    steps: [
      'Chọn một đối tượng trên bản đồ. Nếu đối tượng có replay, nút phát ở thanh thời gian sẽ khả dụng.',
      'Nhấn nút phát để bắt đầu xem diễn biến.',
      'Trong lúc replay chạy, bản đồ có thể tự di chuyển, đổi năm, làm nổi bật đường đi, vùng ảnh hưởng hoặc các điểm quan trọng.',
      'Dùng các nút điều khiển replay để tạm dừng, phát lại, đổi tốc độ hoặc thoát khỏi chế độ replay.',
      'Nếu không thấy nút phát hoạt động, đối tượng đang chọn có thể chưa có replay.'
    ],
  },
  {
    id: 'menu',
    title: 'Menu trợ giúp và tài khoản',
    summary: 'Nút tròn bên trái mở các lối tắt tới tài khoản, chỉnh sửa, chatbot, FAQ và trang giới thiệu.',
    steps: [
      'Nhấn nút tròn avatar/người dùng ở bên trái để mở menu.',
      'Nút bút chì đưa tới khu vực quản trị và chỉnh sửa. Tính năng này chỉ hỗ trợ tốt trên desktop.',
      'Nút tia sét bật chế độ tải nhanh hơn cho lần vào sau.',
      'Nút chat mở trợ lý AI lịch sử để hỏi nhanh về dữ liệu hoặc sự kiện.',
      'Nút quyển sách mở trang hướng dẫn này. Nút thông tin mở trang giới thiệu dự án.'
    ],
  },
  {
    id: 'mobile',
    title: 'Lưu ý khi dùng trên điện thoại',
    summary: 'Giao diện mobile ưu tiên bản đồ toàn màn hình, các panel và control sẽ được thu gọn.',
    steps: [
      'Thanh timeline trên mobile nằm phía dưới, gồm ô năm, nút -/+, công tắc lọc và thước kéo.',
      'Bảng wiki mở ở phía dưới màn hình để không che toàn bộ bản đồ.',
      'Một số thao tác quản trị hoặc chỉnh sửa bị khóa trên mobile để tránh lỗi thao tác.',
      'Nếu khó chọn một đối tượng nhỏ, hãy phóng to bản đồ trước rồi nhấn lại.'
    ],
  },
];

const quickTips = [
  'Muốn xem dữ liệu theo một năm cụ thể: nhập năm ở thanh timeline.',
  'Muốn hiểu một vùng trên bản đồ: nhấn vào vùng đó để mở wiki.',
  'Muốn bản đồ đỡ rối: tắt bớt lớp geometry bên trái.',
  'Muốn xem diễn biến: chọn đối tượng có replay rồi nhấn nút phát.',
  'Muốn hỏi nhanh: mở menu bên trái và chọn chatbot.'
];

const troubleshooting = [
  {
    question: 'Tại sao tôi không thấy dữ liệu sau khi đổi năm?',
    answer: 'Có thể năm đang chọn không có geometry phù hợp hoặc bộ lọc timeline đang bật. Hãy thử tắt lọc timeline, tăng Range trên desktop hoặc chuyển sang năm gần hơn với sự kiện bạn đang xem.',
  },
  {
    question: 'Tại sao nhấn vào bản đồ nhưng không mở wiki?',
    answer: 'Một số geometry có thể chưa liên kết wiki hoặc bạn đang nhấn vào nền bản đồ. Hãy phóng to hơn, nhấn trực tiếp vào vùng/đường/biểu tượng, hoặc thử tìm bằng ô tìm kiếm.',
  },
  {
    question: 'Tại sao không phát được replay?',
    answer: 'Replay chỉ có ở những đối tượng đã được biên soạn kịch bản. Nếu nút phát không phản hồi, hãy chọn một đối tượng khác hoặc tìm các sự kiện/trận đánh đã có dữ liệu replay.',
  },
  {
    question: 'Tại sao bản đồ tải chậm?',
    answer: 'Bản đồ cần tải nền, geometry, wiki và quan hệ dữ liệu. Bạn có thể bật chế độ tải nhanh trong menu bên trái, giảm số lớp đang bật hoặc chờ bản đồ tải xong trước khi thao tác liên tục.',
  },
  {
    question: 'Tôi muốn chỉnh sửa hoặc đóng góp dữ liệu thì làm thế nào?',
    answer: 'Mở menu bên trái và vào khu vực quản trị/chỉnh sửa trên desktop. Nếu chưa có quyền phù hợp, hãy đăng nhập và gửi yêu cầu nâng quyền theo luồng trong tài khoản người dùng.',
  },
];

export default function Page() {
  const [openSection, setOpenSection] = useState<string>('start');
  const [openTrouble, setOpenTrouble] = useState<number | null>(0);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleGuideNavClick = (sectionId: string) => {
    setOpenSection(sectionId);

    requestAnimationFrame(() => {
      sectionRefs.current[sectionId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-blue-700">Hướng dẫn sử dụng</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Ultimate History Map FAQ</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Trang này hướng dẫn cách sử dụng màn bản đồ tại route <span className="font-semibold text-slate-900">/</span>: xem lịch sử theo timeline, tìm kiếm, bật/tắt lớp, đọc wiki và phát replay.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-md bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Quay lại bản đồ
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mục hướng dẫn</p>
            <div className="flex flex-col gap-1">
              {guideSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => handleGuideNavClick(section.id)}
                  className={`rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                    openSection === section.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </div>
          </div>
        </nav>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold">Dùng nhanh trong 1 phút</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {quickTips.map((tip, index) => (
                <div key={tip} className="flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-slate-700">{tip}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {guideSections.map((section) => {
              const isOpen = openSection === section.id;
              return (
                <div
                  key={section.id}
                  ref={(element) => {
                    sectionRefs.current[section.id] = element;
                  }}
                  className="scroll-mt-6 border-b border-slate-200 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => setOpenSection(isOpen ? '' : section.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-slate-50 sm:px-6"
                  >
                    <span>
                      <span className="block text-lg font-bold text-slate-950">{section.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">{section.summary}</span>
                    </span>
                    <span className="shrink-0 text-2xl font-light text-blue-700">{isOpen ? '-' : '+'}</span>
                  </button>

                  <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[620px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <ol className="space-y-3 px-5 pb-6 sm:px-6">
                      {section.steps.map((step, index) => (
                        <li key={step} className="flex gap-3 text-sm leading-6 text-slate-700">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                            {index + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold">Lỗi thường gặp</h2>
            <div className="mt-4 divide-y divide-slate-200">
              {troubleshooting.map((item, index) => {
                const isOpen = openTrouble === index;
                return (
                  <div key={item.question}>
                    <button
                      type="button"
                      onClick={() => setOpenTrouble(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-4 py-4 text-left"
                    >
                      <span className="font-semibold text-slate-900">{item.question}</span>
                      <span className="shrink-0 text-2xl font-light text-blue-700">{isOpen ? '-' : '+'}</span>
                    </button>
                    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-40 opacity-100 pb-4' : 'max-h-0 opacity-0'}`}>
                      <p className="text-sm leading-6 text-slate-600">{item.answer}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
