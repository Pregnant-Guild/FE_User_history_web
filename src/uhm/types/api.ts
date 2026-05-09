export type ApiEnvelope<T> = {
    // API cũ: "success" | "error"
    // API mới: boolean (true/false)
    status: boolean | "success" | "error" | string;
    data?: T;
    message?: string;
    errors?: unknown;
    pagination?: unknown;
};

export type GeometriesBBoxQuery = {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
    time?: number;
    // New API: time_range (0-30) to expand the timeline query window.
    timeRange?: number;
    entity_id?: string;
};
