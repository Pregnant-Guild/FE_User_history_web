"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import MapPlaceholder from "./MapPlaceholder";

const PublicPreviewClientPage = dynamic(
    () => import("./PublicPreviewClientPage"),
    {
        ssr: false,
        loading: () => <MapPlaceholder />,
    }
);

export default function PublicPreviewWrapper() {
    const [loadInteractive, setLoadInteractive] = useState(false);

    useEffect(() => {
        const handleInteraction = () => {
            setLoadInteractive(true);
        };

        window.addEventListener("click", handleInteraction, { passive: true, once: true });
        window.addEventListener("touchstart", handleInteraction, { passive: true, once: true });
        window.addEventListener("keydown", handleInteraction, { passive: true, once: true });

        // Tải trước (prefetch) file JS của bản đồ sau 1.5s để lưu vào cache trình duyệt
        // Giúp người dùng click vào là có bản đồ ngay mà không làm giảm điểm Lighthouse lúc đầu
        const prefetchTimer = setTimeout(() => {
            import("./PublicPreviewClientPage").catch(() => {});
        }, 1500);

        return () => {
            window.removeEventListener("click", handleInteraction);
            window.removeEventListener("touchstart", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
            clearTimeout(prefetchTimer);
        };
    }, []);

    if (!loadInteractive) {
        return <MapPlaceholder isLoaderOnly={false} onEnter={() => setLoadInteractive(true)} />;
    }

    return <PublicPreviewClientPage />;
}
