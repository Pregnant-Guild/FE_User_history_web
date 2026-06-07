import type { Metadata } from "next";
import PublicPreviewWrapper from "@/uhm/components/preview/PublicPreviewWrapper";

export const metadata: Metadata = {
    title: "Ultimate History Map | Bản Đồ Lịch Sử Thế Giới Tương Tác",
    description: "Khám phá lịch sử thế giới qua bản đồ tương tác theo dòng thời gian. Xem lại các trận đánh diễn biến lịch sử sinh động qua hệ thống Replay.",
};

const srOnlyStyle: React.CSSProperties = {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: "0",
};

export default function Page() {
    return (
        <div style={{ position: "relative", width: "100%", height: "100svh", overflow: "hidden" }}>
            {/* Preload LCP image */}
            <link rel="preload" as="image" href="/images/map_placeholder.webp" fetchPriority="high" />

            {/* Header (SSR & SEO) */}
            <header style={srOnlyStyle}>
                <nav>
                    <a href="/">Trang chủ</a>
                    <a href="/faq">Hướng dẫn / FAQ</a>
                    <a href="/about-us">Về chúng tôi</a>
                    <a href="/user">Quản trị viên</a>
                </nav>
            </header>

            {/* Main Content & Semantic Heading (SSR & SEO) */}
            <main style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }}>
                <div style={srOnlyStyle}>
                    <h1>Ultimate History Map - Bản Đồ Tương Tác Lịch Sử</h1>
                    <p>
                        Dự án Ultimate History Map cung cấp cái nhìn trực quan và sinh động về sự thay đổi biên giới, các quốc gia, sự kiện lịch sử thế giới theo từng năm.
                    </p>
                    <p>
                        Tính năng chính bao gồm:
                        - Xem bản đồ lịch sử theo dòng thời gian (Timeline).
                        - Trình phát diễn biến lịch sử và chiến trận (Replay).
                        - Tra cứu thông tin sự kiện lịch sử (Wiki & Entities).
                    </p>
                </div>

                {/* Stateful Interactive Client Component */}
                <PublicPreviewWrapper />
            </main>

            {/* Footer (SSR & SEO) */}
            <footer style={srOnlyStyle}>
                <p>&copy; {new Date().getFullYear()} Ultimate History Map. All rights reserved.</p>
            </footer>
        </div>
    );
}
