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

export type EntitySnapshotOperation = "create" | "update" | "delete" | "reference";

export type EntitySnapshot = {
    id: string;
    // Where this entity's data comes from.
    // - inline: data is embedded in snapshot_json
    // - ref: data should be fetched externally by id (DB/global)
    source: "inline" | "ref";
    // Delta semantics for this commit:
    // - create/update/delete: this commit modifies the entity record
    // - reference: this entity is referenced/linked (e.g., geometry<->entity, entity<->wiki) but not modified
    operation?: EntitySnapshotOperation;
    name?: string;
    slug?: string | null;
    description?: string | null;
    type_id?: string | null;
    status?: number | null;
    base_updated_at?: string;
    base_hash?: string;
};
