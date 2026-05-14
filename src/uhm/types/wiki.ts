// BackEndGo snapshot expects wiki doc as a string (stored in DB as TEXT).
// FE stores Tiptap JSON as a JSON-stringified payload.
export type WikiDoc = string | null;

export type WikiContentSample = {
  id: string;
  title: string;
  created_at: string;
};

export type WikiSnapshotOperation = "create" | "update" | "delete" | "reference";

export type WikiSnapshot = {
  id: string;
  source: "inline" | "ref";
  operation?: WikiSnapshotOperation;
  title: string;
  slug?: string | null;
  doc: WikiDoc;
  content_sample?: WikiContentSample[];
  updated_at?: string;
};

