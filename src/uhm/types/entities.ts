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
    // - reference: this entity is kept as-is (no modification in this commit). Relationship assignments live in
    //   join tables (geometry_entity / entity_wiki), not here.
    operation?: EntitySnapshotOperation;
    name?: string;
    description?: string | null;
};
