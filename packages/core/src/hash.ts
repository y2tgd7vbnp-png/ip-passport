/**
 * 统一 SHA-256 接口（Node 用 crypto，浏览器用 WebCrypto）。
 * 所有哈希按字节拼接；字符串一律 UTF-8 编码（需求 5）。
 */

export type Bytes = Uint8Array;

/** SHA-256 摘要，0x 前缀 + 64 个十六进制字符 */
export type Hex32 = `0x${string}`;

const HEX = "0123456789abcdef";

export function bytesToHex(bytes: Bytes): Hex32 | string {
  let s = "0x";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    s += HEX[b >> 4]! + HEX[b & 0x0f]!;
  }
  return s as Hex32;
}

export function hexToBytes(hex: string): Bytes {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error("十六进制字符串长度必须为偶数");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function isHex32(v: unknown): v is Hex32 {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

export function concatBytes(...parts: Bytes[]): Bytes {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function utf8ToBytes(s: string): Bytes {
  return new TextEncoder().encode(s);
}

export function compareBytes(a: Bytes, b: Bytes): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

/** SHA-256(input)，返回 bytes */
export async function sha256(input: Bytes): Promise<Bytes> {
  const digest = await subsiteDigest(input);
  return digest;
}

async function subsiteDigest(input: Bytes): Promise<Bytes> {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", input as BufferSource);
    return new Uint8Array(buf);
  }
  // Node 兜底（Node 20 自带 globalThis.crypto，此分支主要服务旧环境）
  const { createHash } = await import("node:crypto");
  return new Uint8Array(createHash("sha256").update(input).digest());
}

/** SHA-256，返回 0x hex */
export async function sha256Hex(input: Bytes): Promise<Hex32> {
  return bytesToHex(await sha256(input)) as Hex32;
}

/**
 * 文件叶子（需求 5.1）：leaf = SHA256(0x00 || salt || fileDigest)
 * 加盐防止短文本被字典反推。盐为 32 字节随机数，仅存本地。
 */
export async function computeLeaf(salt: Bytes, fileDigest: Bytes): Promise<Hex32> {
  if (salt.length !== 32) throw new Error("salt 必须为 32 字节");
  if (fileDigest.length !== 32) throw new Error("fileDigest 必须为 32 字节");
  return sha256Hex(concatBytes(new Uint8Array([0x00]), salt, fileDigest));
}

export function randomSalt(): Bytes {
  const salt = new Uint8Array(32);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(salt);
  } else {
    throw new Error("当前环境无安全随机源");
  }
  return salt;
}

export async function sha256FileDigest(fileBytes: Bytes): Promise<Hex32> {
  return sha256Hex(fileBytes);
}
