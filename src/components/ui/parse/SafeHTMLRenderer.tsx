"use client";
import { useEffect, useRef } from "react";

// Component này đóng vai trò như một "vùng an toàn"
export function SafeHTMLRenderer({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // 1. Giải mã HTML Entities (Biến &lt; thành <, &quot; thành ", ...)
      const txt = document.createElement("textarea");
      txt.innerHTML = html;
      let decoded = txt.value;

      // 2. Xử lý xóa thẻ <pre> bọc ngoài nếu API trả về dư thừa
      decoded = decoded.replace(/<pre[^>]*>/g, "").replace(/<\/pre>/g, "");

      // 3. Khởi tạo Shadow DOM (nếu chưa có)
      const shadowRoot = containerRef.current.shadowRoot || containerRef.current.attachShadow({ mode: "open" });
      
      // 4. Render nội dung vào trong vùng cô lập
      shadowRoot.innerHTML = decoded;
    }
  }, [html]);

  return <div ref={containerRef} className="w-full h-auto" />;
}