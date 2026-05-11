import { Panel } from "./Panel";

type SessionPanelProps = {
    createdEntities: Array<{
        id: string;
        name: string;
    }>;
    createdGeometries: Array<{
        id: string | number;
        geometryType: string;
        semanticType?: string | null;
        entityNames: string[];
    }>;
};

export function SessionPanel({
    createdEntities,
    createdGeometries,
}: SessionPanelProps) {
    return (
        <Panel title="This Session" defaultOpen={false}>
            <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 6 }}>
                Entities ({createdEntities.length})
            </div>
            {createdEntities.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 12, marginBottom: 10 }}>Chưa tạo entity mới</div>
            ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12, marginBottom: 10 }}>
                    {createdEntities.map((entity) => (
                        <li
                            key={entity.id}
                            style={{ padding: "6px 0", borderBottom: "1px solid #1f2937", color: "#e2e8f0" }}
                            title={entity.id}
                        >
                            {entity.name}
                        </li>
                    ))}
                </ul>
            )}

            <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 6 }}>
                Geometries mới chưa commit ({createdGeometries.length})
            </div>
            {createdGeometries.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 12 }}>Chưa có geometry mới chờ commit</div>
            ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12 }}>
                    {createdGeometries.map((geometry) => (
                        <li
                            key={String(geometry.id)}
                            style={{ padding: "6px 0", borderBottom: "1px solid #1f2937", color: "#e2e8f0" }}
                        >
                            #{geometry.id} [{geometry.geometryType}]{" "}
                            {geometry.semanticType ? `- ${geometry.semanticType}` : ""}
                            {geometry.entityNames.length ? ` | ${geometry.entityNames.join(", ")}` : ""}
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}
