export type Entity = {
    id: string;
    name: string;
    // API mới
    description?: string | null;
    thumbnail_url?: string | null;
    is_deleted?: boolean;
    created_at?: string;
    updated_at?: string;

    // API cũ / snapshot editor (giữ optional để không phá flow editor snapshot)
    slug?: string | null;
    type_id?: string | null;
    status?: number | null;
    geometry_count?: number;
};

export type EntitySnapshotOperation = "create" | "update" | "delete" | "reference" | "replace";

export type EntitySnapshot = {
    id: string;
    operation: EntitySnapshotOperation;
    name?: string;
    slug?: string | null;
    description?: string | null;
    type_id?: string | null;
    status?: number | null;
    is_deleted?: number;
    base_updated_at?: string;
    base_hash?: string;
};
