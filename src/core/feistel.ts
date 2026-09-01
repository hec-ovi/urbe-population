/**
 * Stateless pseudorandom permutation over [0, n): 4-round Feistel network
 * with cycle walking for arbitrary n. O(1) memory, invertible, so unique
 * slots (homes, jobs) assign lazily with no bookkeeping and no collisions.
 */

const ROUNDS = 4;

function mix(x: number, key: number): number {
  let t = (x + key) | 0;
  t = Math.imul(t ^ (t >>> 15), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return (t ^ (t >>> 16)) >>> 0;
}

export class Permutation {
  private readonly n: number;
  private readonly halfBits: number;
  private readonly mask: number;
  private readonly keys: number[];

  constructor(n: number, key: string) {
    if (!Number.isInteger(n) || n < 1) throw new Error(`Permutation size must be a positive integer, got ${n}`);
    this.n = n;
    let bits = 1;
    while (1 << (2 * bits) < n) bits++;
    this.halfBits = bits;
    this.mask = (1 << bits) - 1;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
    this.keys = [];
    for (let r = 0; r < ROUNDS; r++) this.keys.push(mix(h, r * 0x9e3779b9));
  }

  private encryptOnce(i: number): number {
    let left = (i >>> this.halfBits) & this.mask;
    let right = i & this.mask;
    for (let r = 0; r < ROUNDS; r++) {
      const next = left ^ (mix(right, this.keys[r]!) & this.mask);
      left = right;
      right = next;
    }
    return ((left << this.halfBits) | right) >>> 0;
  }

  private decryptOnce(i: number): number {
    let left = (i >>> this.halfBits) & this.mask;
    let right = i & this.mask;
    for (let r = ROUNDS - 1; r >= 0; r--) {
      const prev = right ^ (mix(left, this.keys[r]!) & this.mask);
      right = left;
      left = prev;
    }
    return ((left << this.halfBits) | right) >>> 0;
  }

  /** i in [0, n) to its shuffled position in [0, n). */
  forward(i: number): number {
    let x = this.encryptOnce(i);
    while (x >= this.n) x = this.encryptOnce(x);
    return x;
  }

  /** Inverse of forward. */
  inverse(i: number): number {
    let x = this.decryptOnce(i);
    while (x >= this.n) x = this.decryptOnce(x);
    return x;
  }
}
