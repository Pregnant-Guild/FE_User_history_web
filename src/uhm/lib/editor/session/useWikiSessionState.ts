import { useState } from "react";
import type { WikiSnapshot } from "@/uhm/types/wiki";
import type { EntityWikiLinkSnapshot } from "@/uhm/types/sections";

export function useWikiSessionState() {
  const [wikis, setWikis] = useState<WikiSnapshot[]>([]);
  const [entityWikiLinks, setEntityWikiLinks] = useState<EntityWikiLinkSnapshot[]>([]);
  return { wikis, setWikis, entityWikiLinks, setEntityWikiLinks };
}
