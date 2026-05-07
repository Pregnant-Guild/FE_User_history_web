import { useState } from "react";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/sections";

export function useWikiSessionState() {
  const [snapshotWikis, setSnapshotWikis] = useState<WikiSnapshot[]>([]);
  const [snapshotEntityWikiLinks, setSnapshotEntityWikiLinks] = useState<EntityWikiLinkSnapshot[]>([]);
  return { snapshotWikis, setSnapshotWikis, snapshotEntityWikiLinks, setSnapshotEntityWikiLinks };
}
