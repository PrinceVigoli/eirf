import { createHash } from "node:crypto";

export function calculateLogHash(
  previousHash: string | null,
  createdAt: Date,
  officerId: number | null,
  action: string,
  details: string,
): string {
  return createHash("sha256")
    .update(`${previousHash ?? ""}|${createdAt.toISOString()}|${officerId ?? ""}|${action}|${details}`)
    .digest("hex");
}
