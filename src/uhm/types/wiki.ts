export type WikiDoc = unknown;

export type WikiSnapshotOperation = "create" | "update" | "delete" | "reference";

export type WikiSnapshot = {
  id: string;
  source?: "inline" | "ref";
  ref?: { id: string };
  // Optional for backwards-compat with older commits. New commits should include it.
  operation?: WikiSnapshotOperation;
  title: string;
  doc: WikiDoc;
  updated_at?: string;
  // Optional, used when representing a delete operation row.
  is_deleted?: number;
};
