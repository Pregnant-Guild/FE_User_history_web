// BackEndGo snapshot expects wiki doc as a string (stored in DB as TEXT).
// FE wiki runtime now stores HTML or plain text in this string field.
export type WikiDoc = string | null;

export type WikiSnapshotOperation = "create" | "update" | "delete" | "reference";

export type WikiSnapshot = {
  id: string;
  source: "inline" | "ref";
  operation?: WikiSnapshotOperation;
  title: string;
  slug?: string | null;
  doc: WikiDoc;
};
