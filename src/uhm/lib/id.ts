import { v7 as uuidv7 } from "uuid";

// Centralized ID generator for all client-created identifiers in FrontEndAdmin.
// UUIDv7 is time-ordered (RFC 9562) and works well for sorting by creation time.
export function newId(): string {
  return uuidv7();
}

