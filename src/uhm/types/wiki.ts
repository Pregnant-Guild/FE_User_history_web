export type WikiDoc = unknown;

export type WikiSnapshotOperation = "create" | "update" | "delete" | "reference";

export type WikiSnapshot = {
  id: string;
  source: "inline" | "ref";
  // Optional for backwards-compat with older commits. New commits should include it.
  operation?: WikiSnapshotOperation;
  title: string;
  doc: WikiDoc;
  updated_at?: string;
};
