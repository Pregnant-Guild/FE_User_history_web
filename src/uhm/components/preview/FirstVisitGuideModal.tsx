"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "uhm-public-first-guide-seen-v1";

type GuideItem = {
    title: string;
    details?: string[];
};

const guideItems: GuideItem[] = [
    {
        title: "Kéo bản đồ để di chuyển, cuộn để phóng to.",
    },
    {
        title: "Dùng timeline phía dưới để chọn năm lịch sử.",
        details: [
            "Kéo chuột sang trái hoặc phải để điều chỉnh năm hiển thị.",
            "Lăn chuột trên timeline để điều chỉnh phạm vi kéo.",
            "Nhập trực tiếp năm vào ô số để đi nhanh tới mốc cần xem.",
            "Range là phạm vi năm muốn hiển thị. Ví dụ time 1990 và range 5 sẽ hiển thị thông tin từ 1985 đến 1995.",
        ],
    },
    {
        title: "Nhấn vào vùng, điểm hoặc đường trên bản đồ để mở wiki.",
        details: [
            "Có thể dùng Shift + lăn chuột để chọn thông tin chi tiết muốn tìm hiểu.",
        ],
    },
    {
        title: "Bật/tắt lớp bản đồ ở bảng bên trái.",
        details: [
            "Có thể bật/tắt các đối tượng bản đồ tự nhiên lẫn lịch sử.",
        ],
    },
    {
        title: "Nếu đối tượng có replay, nhấn nút phát để xem diễn biến.",
        details: [
            "Trong quá trình replay có thể dừng và tương tác như bình thường(những vì vấn đề kĩ thuật chúng tôi chưa thể làm việc đó mà không xảy ra lỗi, nên hiện tại chức năng replay bị hạn chế tương tác).",
        ],
    },
    {
        title: "Sử dụng wiki để tìm kiếm thông tin liên quan.",
        details: [
            "Đối với các link trong wiki, màu xanh là đã có thông tin, màu đỏ là chưa có thông tin.",
            "Chọn link bằng chuột trái để hiển thị wiki đích và bản đồ tự di chuyển đến khu vực liên quan.",
            "Có thể nhấn chuột phải vào các link để có thêm lựa chọn khác.",
        ],
    },
];

export default function FirstVisitGuideModal() {
    const [isOpen, setIsOpen] = useState(() => shouldShowFirstVisitGuide());

    const closeGuide = useCallback(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, "1");
        } catch {
            // Ignore storage failures; closing the modal should still work.
        }
        setIsOpen(false);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeGuide();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [closeGuide, isOpen]);

    if (!isOpen) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="first-visit-guide-title"
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
        >
            <div className="flex max-h-[calc(100svh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-white/10 bg-white text-slate-950 shadow-2xl">
                <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
                    <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                        Hướng dẫn nhanh
                    </p>
                    <h2 id="first-visit-guide-title" className="mt-1 text-2xl font-bold">
                        Chào mừng đến Ultimate History Map
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        Một vài thao tác chính để bạn bắt đầu xem bản đồ lịch sử, wiki và replay.
                    </p>
                </div>

                <div className="overflow-y-auto px-5 py-4 sm:px-6">
                    <ol className="space-y-3">
                        {guideItems.map((item, index) => (
                            <li key={item.title} className="rounded-md border border-slate-200 bg-slate-50">
                                {item.details?.length ? (
                                    <details className="group">
                                        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                                                {index + 1}
                                            </span>
                                            <span className="min-w-0 flex-1 text-sm font-semibold leading-6 text-slate-900">
                                                {item.title}
                                            </span>
                                            <span className="pt-0.5 text-xl leading-none text-blue-700 group-open:hidden">
                                                +
                                            </span>
                                            <span className="hidden pt-0.5 text-xl leading-none text-blue-700 group-open:block">
                                                -
                                            </span>
                                        </summary>
                                        <ul className="space-y-2 border-t border-slate-200 px-4 py-3 pl-14">
                                            {item.details.map((detail) => (
                                                <li key={detail} className="list-disc text-sm leading-6 text-slate-700">
                                                    {detail}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : (
                                    <div className="flex items-start gap-3 px-4 py-3">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                                            {index + 1}
                                        </span>
                                        <span className="text-sm font-semibold leading-6 text-slate-900">
                                            {item.title}
                                        </span>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <Link
                        href="/faq"
                        onClick={closeGuide}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                        Xem hướng dẫn chi tiết
                    </Link>
                    <button
                        type="button"
                        onClick={closeGuide}
                        className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-700"
                    >
                        Bắt đầu khám phá
                    </button>
                </div>
            </div>
        </div>
    );
}

function shouldShowFirstVisitGuide(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(STORAGE_KEY) !== "1";
    } catch {
        return true;
    }
}
