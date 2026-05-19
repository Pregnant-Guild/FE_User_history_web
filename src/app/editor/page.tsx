"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/uhm/api/http";
import { fetchProjects, type Project } from "@/uhm/api/projects";

export default function EditorIndexPage() {
    const router = useRouter();
    // State danh sách project mà user hiện tại có quyền mở trong editor.
    const [projects, setProjects] = useState<Project[]>([]);
    // State loading cho lần tải đầu của route /editor.
    const [isLoading, setIsLoading] = useState(true);
    // State lỗi hiển thị trực tiếp khi API hoặc auth không hợp lệ.
    const [error, setError] = useState<string | null>(null);

    // Sắp xếp project mới cập nhật lên đầu để user mở nhanh project đang làm.
    const sortedProjects = useMemo(() => {
        return [...projects].sort((a, b) => {
            const aTime = Date.parse(a.updated_at || a.created_at || "");
            const bTime = Date.parse(b.updated_at || b.created_at || "");
            return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
        });
    }, [projects]);

    // Route /editor là landing page: tải project list và để /editor/[id] xử lý editor đầy đủ.
    useEffect(() => {
        let disposed = false;

        async function loadProjects() {
            try {
                setIsLoading(true);
                setError(null);
                const rows = await fetchProjects();
                if (!disposed) setProjects(rows || []);
            } catch (err) {
                if (disposed) return;
                if (err instanceof ApiError && err.status === 401) {
                    router.replace("/signin");
                    return;
                }
                setError(err instanceof Error ? err.message : "Không tải được danh sách project.");
            } finally {
                if (!disposed) setIsLoading(false);
            }
        }

        void loadProjects();
        return () => {
            disposed = true;
        };
    }, [router]);

    return (
        <main style={{ minHeight: "100vh", background: "#0b1220", color: "#e5e7eb", padding: 24 }}>
            <div style={{ maxWidth: 960, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Editor</h1>
                        <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: 14 }}>
                            Chọn project để mở route <code>/editor/[id]</code>.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => router.push("/user/projects")}
                        style={{
                            border: "1px solid #334155",
                            background: "#111827",
                            color: "#e5e7eb",
                            borderRadius: 10,
                            padding: "10px 12px",
                            cursor: "pointer",
                            fontWeight: 700,
                        }}
                    >
                        Quản lý project
                    </button>
                </div>

                <section
                    style={{
                        marginTop: 24,
                        border: "1px solid #1f2937",
                        borderRadius: 16,
                        background: "#111827",
                        overflow: "hidden",
                    }}
                >
                    {isLoading ? (
                        <div style={{ padding: 24, color: "#94a3b8" }}>Đang tải project...</div>
                    ) : error ? (
                        <div style={{ padding: 24, color: "#fecaca" }}>{error}</div>
                    ) : sortedProjects.length === 0 ? (
                        <div style={{ padding: 24, color: "#94a3b8" }}>
                            Chưa có project. Vào trang quản lý project để tạo mới.
                        </div>
                    ) : (
                        <div style={{ display: "grid" }}>
                            {sortedProjects.map((project) => (
                                <button
                                    key={project.id}
                                    type="button"
                                    onClick={() => router.push(`/editor/${project.id}`)}
                                    style={{
                                        display: "grid",
                                        gap: 6,
                                        textAlign: "left",
                                        border: 0,
                                        borderBottom: "1px solid #1f2937",
                                        background: "transparent",
                                        color: "#e5e7eb",
                                        padding: 16,
                                        cursor: "pointer",
                                    }}
                                >
                                    <span style={{ fontSize: 15, fontWeight: 800 }}>
                                        {project.title || `Project ${project.id}`}
                                    </span>
                                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                                        {project.project_status || "ACTIVE"} · {project.id}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
