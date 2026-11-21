/**
 * Merkle 树（需求 5.2 / 5.4）：
 * - 叶子按字节序升序排序后建树
 * - 内部节点：SHA256(0x01 || min(a,b) || max(a,b))，有序对，无需左右标记
 * - 奇数个节点时最后一个直接上提，不复制
 * - 单叶子时 root = leaf
 * 同一套规则用于版本内文件树（5.2）与批量锚定批次树（5.4）。
 */
import { compareBytes, concatBytes, hexToBytes, sha256Hex, type Bytes, type Hex32 } from "./hash.js";

export type MerkleProof = Hex32[]; // 兄弟节点哈希（从底到顶）；有序对设计无需左右标记

function compareHex(a: Hex32, b: Hex32): number {
  return compareBytes(hexToBytes(a), hexToBytes(b));
}

export async function buildMerkle(leavesInput: Hex32[]): Promise<{ root: Hex32 }> {
  if (leavesInput.length === 0) throw new Error("至少需要一个叶子");
  const leaves = [...leavesInput].sort(compareHex);
  let level: Hex32[] = leaves;
  while (level.length > 1) {
    const next: Hex32[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        const [a, b] = [level[i]!, level[i + 1]!];
        const [lo, hi] = compareHex(a, b) <= 0 ? [a, b] : [b, a];
        next.push(await internalNode(lo, hi));
      } else {
        // 奇数个：最后一个直接上提
        next.push(level[i]!);
      }
    }
    level = next;
  }
  return { root: level[0]! };
}

async function internalNode(a: Hex32, b: Hex32): Promise<Hex32> {
  return sha256Hex(concatBytes(new Uint8Array([0x01]), hexToBytes(a), hexToBytes(b)));
}

/** 生成 leaf 在树中的证明（兄弟路径）。要求 leaf 在 leaves 中。 */
export async function merkleProve(leavesInput: Hex32[], leaf: Hex32): Promise<{ root: Hex32; proof: MerkleProof }> {
  const leaves = [...leavesInput].sort(compareHex);
  const idx = leaves.indexOf(leaf);
  if (idx === -1) throw new Error("叶子不在列表中");
  const proof: MerkleProof = [];
  let level = leaves;
  let i = idx;
  while (level.length > 1) {
    if (i % 2 === 1) {
      proof.push(level[i - 1]!);
    } else if (i + 1 < level.length) {
      proof.push(level[i + 1]!);
    } else {
      // 奇数上提：无兄弟，不加证明节点
    }
    const next: Hex32[] = [];
    for (let j = 0; j < level.length; j += 2) {
      if (j + 1 < level.length) {
        const [a, b] = [level[j]!, level[j + 1]!];
        const [lo, hi] = compareHex(a, b) <= 0 ? [a, b] : [b, a];
        next.push(await internalNode(lo, hi));
      } else {
        next.push(level[j]!);
      }
    }
    level = next;
    i = Math.floor(i / 2);
  }
  return { root: level[0]!, proof };
}

/** 验证证明。leaf → root。 */
export async function merkleVerify(leaf: Hex32, proof: MerkleProof, root: Hex32): Promise<boolean> {
  let cur = leaf;
  for (const sibling of proof) {
    const [lo, hi] = compareHex(cur, sibling) <= 0 ? [cur, sibling] : [sibling, cur];
    cur = await internalNode(lo, hi);
  }
  return cur.toLowerCase() === root.toLowerCase();
}
