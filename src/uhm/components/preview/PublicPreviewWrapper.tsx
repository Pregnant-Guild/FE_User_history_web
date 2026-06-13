"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { setMapEntered } from "@/store/features/uiSlice";
import MapPlaceholder from "./MapPlaceholder";

// Loader component to handle dynamic chunk loading with Redux support
const LoaderComponent = () => {
    const dispatch = useDispatch();

    const handleEnter = () => {
        dispatch(setMapEntered(true));
    };

    return (
        <MapPlaceholder
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
    const [instantLoad, setInstantLoad] = useState<boolean>(() => readInstantLoadPreference());

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleSync = () => {
            setInstantLoad(readInstantLoadPreference());
        };
        window.addEventListener("instant-load-changed", handleSync);
        return () => window.removeEventListener("instant-load-changed", handleSync);
    }, []);

    const toggleInstantLoad = useCallback((val: boolean) => {
        setInstantLoad(val);
        if (typeof window !== "undefined") {
            localStorage.setItem("instant-load", String(val));
            window.dispatchEvent(new Event("instant-load-changed"));
        }
    }, []);

    const handleEnter = useCallback(() => {
        dispatch(setMapEntered(true));
    }, [dispatch]);

    useEffect(() => {
        if (mapEntered) return;

        const handleInteraction = () => {
            handleEnter();
        };

        window.addEventListener("click", handleInteraction, { passive: true, once: true });
        window.addEventListener("touchstart", handleInteraction, { passive: true, once: true });
        window.addEventListener("keydown", handleInteraction, { passive: true, once: true });

        // Auto enter after 3 seconds on mobile
        let timerId: ReturnType<typeof setTimeout> | null = null;
        if (typeof window !== "undefined") {
            const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone/i.test(navigator.userAgent);
            if (isMobile) {
                timerId = setTimeout(() => {
                    handleEnter();
                }, 3000);
            }
        }

        return () => {
            window.removeEventListener("click", handleInteraction);
            window.removeEventListener("touchstart", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
            if (timerId) {
                clearTimeout(timerId);
            }
        };
    }, [handleEnter, mapEntered]);

    return (
        <PublicPreviewClientPage
            userHasEntered={mapEntered}
            onEnter={handleEnter}
            instantLoad={instantLoad}
            toggleInstantLoad={toggleInstantLoad}
        />
    );
}

function readInstantLoadPreference(): boolean {
    if (typeof window === "undefined") return true;
    try {
        const saved = window.localStorage.getItem("instant-load");
        return saved === null ? true : saved === "true";
    } catch {
        return true;
    }
}
