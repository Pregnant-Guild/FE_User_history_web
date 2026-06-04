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
    const [instantLoad, setInstantLoad] = useState<boolean>(true);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("instant-load");
            if (saved !== null) {
                setInstantLoad(saved === "true");
            }
        }
    }, []);

    const handleEnter = () => {
        dispatch(setMapEntered(true));
    };

    const toggleInstantLoad = (val: boolean) => {
        setInstantLoad(val);
        if (typeof window !== "undefined") {
            localStorage.setItem("instant-load", String(val));
        }
        window.dispatchEvent(new Event("instant-load-changed"));
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
    const [instantLoad, setInstantLoad] = useState<boolean>(true);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("instant-load");
            if (saved !== null) {
                setInstantLoad(saved === "true");
            }

            const handleSync = () => {
                const updated = localStorage.getItem("instant-load");
                if (updated !== null) {
                    setInstantLoad(updated === "true");
                }
            };
            window.addEventListener("instant-load-changed", handleSync);
            return () => window.removeEventListener("instant-load-changed", handleSync);
        }
    }, []);

    const toggleInstantLoad = (val: boolean) => {
        setInstantLoad(val);
        if (typeof window !== "undefined") {
            localStorage.setItem("instant-load", String(val));
        }
        window.dispatchEvent(new Event("instant-load-changed"));
    };

    const handleEnter = () => {
        dispatch(setMapEntered(true));
    };

    useEffect(() => {
        if (mapEntered) return;

        const handleInteraction = () => {
            handleEnter();
        };

        window.addEventListener("click", handleInteraction, { passive: true, once: true });
        window.addEventListener("touchstart", handleInteraction, { passive: true, once: true });
        window.addEventListener("keydown", handleInteraction, { passive: true, once: true });

        return () => {
            window.removeEventListener("click", handleInteraction);
            window.removeEventListener("touchstart", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
        };
    }, [mapEntered]);

    if (!mapEntered && !instantLoad) {
        return (
            <MapPlaceholder
                onEnter={handleEnter}
            />
        );
    }

    return (
        <PublicPreviewClientPage 
            userHasEntered={mapEntered} 
            onEnter={handleEnter} 
            instantLoad={instantLoad}
            toggleInstantLoad={toggleInstantLoad}
        />
    );
}
