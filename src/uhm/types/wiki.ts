// BackEndGo snapshot expects wiki doc as a string (stored in DB as TEXT).
// FE stores Tiptap JSON as a JSON-stringified payload.
export type WikiDoc = string | null;

export type WikiSnapshotOperation = "create" | "update" | "delete" | "reference";

export type WikiSnapshot = {
  id: string;
  source: "inline" | "ref";
  // Optional for backwards-compat with older commits. New commits should include it.
  operation?: WikiSnapshotOperation;
  title: string;
  slug?: string | null;
  doc: WikiDoc;
  updated_at?: string;
};
