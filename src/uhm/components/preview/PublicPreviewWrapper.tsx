"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { setMapEntered } from "@/store/features/uiSlice";
import MapPlaceholder from "./MapPlaceholder";

// Loader component to handle dynamic chunk loading with Redux support
const LoaderComponent = () => {
    const mapEntered = useSelector((state: RootState) => state.ui.mapEntered);
    const dispatch = useDispatch();

    const handleEnter = () => {
        dispatch(setMapEntered(true));
    };

    return (
        <MapPlaceholder
            isLoaderOnly={mapEntered}
            onEnter={handleEnter}
        />
    );
};

const PublicPreviewClientPage = dynamic(
    () => import("./PublicPreviewClientPage"),
    {
        ssr: false,
        loading: () => <LoaderComponent />,
    }
);

export default function PublicPreviewWrapper() {
    const mapEntered = useSelector((state: RootState) => state.ui.mapEntered);
    const dispatch = useDispatch();

    const [loadInteractive, setLoadInteractive] = useState(() => mapEntered);

    const handleEnter = () => {
        dispatch(setMapEntered(true));
        setLoadInteractive(true);
    };

    useEffect(() => {
        if (mapEntered) return;

        const handleInteraction = () => {
            handleEnter();
        };

        window.addEventListener("click", handleInteraction, { passive: true, once: true });
        window.addEventListener("touchstart", handleInteraction, { passive: true, once: true });
        window.addEventListener("keydown", handleInteraction, { passive: true, once: true });

        // Tải ngầm bản đồ sau 2.5 giây khi trình duyệt rảnh rỗi (idle)
        let idleId: any = null;
        const prefetchTimer = setTimeout(() => {
            const runPrefetch = () => {
                setLoadInteractive(true);
            };

            if (typeof window !== "undefined") {
                if ("requestIdleCallback" in window) {
                    idleId = (window as any).requestIdleCallback(runPrefetch, { timeout: 3000 });
                } else {
                    setTimeout(runPrefetch, 200);
                }
            }
        }, 2000);

        return () => {
            window.removeEventListener("click", handleInteraction);
            window.removeEventListener("touchstart", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
            clearTimeout(prefetchTimer);
            if (idleId && typeof window !== "undefined" && "cancelIdleCallback" in window) {
                (window as any).cancelIdleCallback(idleId);
            }
        };
    }, [mapEntered]);

    if (!loadInteractive) {
        return <MapPlaceholder isLoaderOnly={false} onEnter={handleEnter} />;
    }

    return <PublicPreviewClientPage userHasEntered={mapEntered} onEnter={handleEnter} />;
}
