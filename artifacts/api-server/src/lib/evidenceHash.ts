import { createHash } from "node:crypto";

export async function hashReadable(stream: NodeJS.ReadableStream): Promise<string> {
  const hasher = createHash("sha256");
  for await (const chunk of stream) hasher.update(chunk as Buffer);
  return hasher.digest("hex");
}
