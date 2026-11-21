/**
 * 本地清单 schema 与 versionRoot / metaHash 计算（需求 5.3 / 5.5）。
 * 规范化 JSON：键名排序、无多余空格。
 */
import { z } from "zod";
import { concatBytes, hexToBytes, sha256Hex, utf8ToBytes, type Hex32 } from "./hash.js";

export const VersionKindSchema = z.enum(["PROMPT", "DRAFT", "COMMIT", "RELEASE"]);
export type VersionKind = z.infer<typeof VersionKindSchema>;

export const MetaSchema = z.object({
  kind: VersionKindSchema,
  createdAtLocal: z.string(),
  note: z.string().optional().default(""),
  gitCommit: z.string().optional(),
  tool: z.string().optional(),
});

export const FileEntrySchema = z.object({
  path: z.string(),
  fileDigest: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  salt: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  leaf: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export const AnchorSchema = z.object({
  mode: z.enum(["single", "batch"]),
  batchRoot: z.string().optional(),
  batchProof: z.array(z.string()).optional(),
  txHash: z.string().optional(),
  chainId: z.number().optional(),
  contract: z.string().optional(),
  blockNumber: z.number().optional(),
  blockTimestamp: z.number().optional(),
});

export const LicenseStateSchema = z.object({
  spdx: z.string(),
  termsHash: z.string().nullable(),
});

export const ManifestSchema = z.object({
  schema: z.literal("ipp.version.v1"),
  workId: z.string(),
  versionRoot: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  prevVersionRoot: z.string(),
  fileRoot: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  meta: MetaSchema,
  files: z.array(FileEntrySchema),
  anchor: AnchorSchema,
  license: LicenseStateSchema,
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type Meta = z.infer<typeof MetaSchema>;

/** 规范化 JSON：键名排序、无多余空格（JSON.stringify 按 insertion order，这里显式递归排序） */
export function canonicalJson(value: unknown): string {
  const sorted = deepSort(value);
  return JSON.stringify(sorted);
}

function deepSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSort);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = deepSort(v);
    return out;
  }
  return value;
}

export async function computeMetaHash(meta: Meta): Promise<Hex32> {
  return sha256Hex(utf8ToBytes(canonicalJson(meta)));
}

/**
 * versionRoot = SHA256("IPP-V1" || workId || prevVersionRoot || fileRoot || metaHash)（需求 5.3）
 * 首个版本 prevVersionRoot 为 32 字节全 0。
 */
export const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export async function computeVersionRoot(
  workId: string,
  prevVersionRoot: string,
  fileRoot: string,
  metaHash: Hex32,
): Promise<Hex32> {
  const prevIsZero = /^0x0*$/.test(prevVersionRoot);
  const prev = prevIsZero ? ZERO32 : (prevVersionRoot as Hex32);
  return sha256Hex(
    concatBytes(
      utf8ToBytes("IPP-V1"),
      hexToBytes(workId),
      hexToBytes(prev),
      hexToBytes(fileRoot),
      hexToBytes(metaHash),
    ),
  ) as Promise<Hex32>;
}
