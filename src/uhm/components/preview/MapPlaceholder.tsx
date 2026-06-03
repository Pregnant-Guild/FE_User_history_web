"use client";

import React from "react";

interface MapPlaceholderProps {
    isLoaderOnly?: boolean;
    onEnter?: () => void;
}

export default function MapPlaceholder({ isLoaderOnly = true, onEnter }: MapPlaceholderProps) {
    if (isLoaderOnly) {
        return (
            <div 
                style={{
                    position: "fixed",
                    inset: 0,
                    backgroundColor: "#060a13",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    zIndex: 9999,
                }}
            >
                {/* Background Image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/images/map_placeholder.webp"
                    alt="Map Loading Placeholder"
                    fetchPriority="high"
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        zIndex: 1,
                        filter: "brightness(0.3) contrast(1.1)",
                    }}
                />

                {/* Dark overlay & Spinner */}
                <div 
                    style={{
                        position: "relative",
                        zIndex: 2,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "16px",
                        backgroundColor: "rgba(6, 10, 19, 0.8)",
                        padding: "24px 32px",
                        borderRadius: "16px",
                        backdropFilter: "blur(8px)",
                        border: "1px solid rgba(217, 119, 6, 0.15)",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                    }}
                >
                    <div 
                        style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            border: "3px solid rgba(217, 119, 6, 0.1)",
                            borderTopColor: "#d97706",
                            animation: "placeholder-spin 1.2s linear infinite",
                        }}
                    />
                    <style dangerouslySetInnerHTML={{ __html: `
                        @keyframes placeholder-spin {
                            to { transform: rotate(360deg); }
                        }
                    `}} />
                    <span 
                        style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            letterSpacing: "0.15em",
                            color: "#eab308",
                            textShadow: "0 0 10px rgba(234, 179, 7, 0.3)",
                            fontFamily: "Georgia, serif",
                        }}
                    >
                        ĐANG TẢI DỮ LIỆU...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div 
            onClick={onEnter}
            style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "#060a13",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                zIndex: 9999,
                padding: "24px",
                cursor: "pointer",
            }}
        >
            {/* Background image under overlay */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/images/map_placeholder.webp"
                alt="Map Background"
                fetchPriority="high"
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    zIndex: 1,
                    transform: "scale(1.02)",
                    filter: "brightness(0.25) contrast(1.15) sepia(0.2)",
                    transition: "transform 10s ease-out",
                }}
            />

            {/* Glowing background gradient lights - Warm Candle & Antique ambiance */}
            <div 
                style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 2,
                    background: "radial-gradient(circle at 50% 50%, rgba(217, 119, 6, 0.05) 0%, rgba(6, 10, 19, 0.6) 60%, #060a13 100%)",
                }}
            />

            {/* Content Container (Antique, Luxurious serif typography) */}
            <div 
                style={{
                    position: "relative",
                    zIndex: 3,
                    width: "100%",
                    maxWidth: "640px",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "20px",
                }}
            >
                {/* Title (Largest, gold/yellow color, antique Georgia font) */}
                <h1 
                    style={{
                        fontFamily: "Georgia, serif",
                        fontSize: "min(52px, 10vw)",
                        fontWeight: "normal",
                        letterSpacing: "0.02em",
                        color: "#f59e0b",
                        margin: 0,
                        lineHeight: 1.1,
                        textShadow: "0 0 20px rgba(245, 158, 11, 0.25), 0 2px 4px rgba(0, 0, 0, 0.8)",
                        textTransform: "uppercase",
                    }}
                >
                    Ultimate History Map
                </h1>

                {/* Subtitle / Description (Right below title, italic, elegant, muted color) */}
                <p 
                    style={{
                        fontFamily: "Georgia, serif",
                        fontStyle: "italic",
                        fontSize: "min(16px, 4.5vw)",
                        color: "#94a3b8",
                        lineHeight: "1.7",
                        margin: 0,
                        maxWidth: "480px",
                        textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
                    }}
                >
                    Hành trình khám phá biên giới, quốc gia và các sự kiện lịch sử thế giới qua bản đồ tương tác theo dòng thời gian.
                </p>
            </div>

            {/* Bottom hint "nhấn vào chỗ bất kì để vào" with a slow breathing/fade pulse animation */}
            <div 
                style={{
                    position: "absolute",
                    bottom: "50px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 4,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    pointerEvents: "none",
                }}
            >
                <div 
                    style={{
                        fontFamily: "Georgia, serif",
                        fontSize: "12px",
                        fontWeight: "normal",
                        letterSpacing: "0.2em",
                        color: "#d97706",
                        textTransform: "uppercase",
                        opacity: 0.8,
                        animation: "placeholder-pulse 2s ease-in-out infinite",
                        textShadow: "0 0 8px rgba(217, 119, 6, 0.4)",
                    }}
                >
                    nhấn vào chỗ bất kì để vào
                </div>
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes placeholder-pulse {
                        0%, 100% { opacity: 0.35; transform: scale(0.98); }
                        50% { opacity: 0.95; transform: scale(1); }
                    }
                `}} />
            </div>
        </div>
    );
}
