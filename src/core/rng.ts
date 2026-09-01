/**
 * Event-keyed deterministic RNG: every stream is a pure function of
 * (world seed, tag, ids), independent of call order. xmur3 string hash
 * seeds an sfc32 stream; Math.imul and unsigned shifts only, so results
 * are identical across engines.
 */

const SEP = '';

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class Rand {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(key: string) {
    const g = xmur3(key);
    this.a = g();
    this.b = g();
    this.c = g();
    this.d = g();
    this.next();
    this.next();
  }

  /** Uniform in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Integer in [min, max], inclusive. */
  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)]!;
  }

  /** Index into weights, proportional to each weight. */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]!;
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
}

/** New stream keyed by seed plus event identifiers. */
export function rand(seed: string | number, ...key: (string | number)[]): Rand {
  return new Rand(`${seed}${SEP}${key.join(SEP)}`);
}

/** One uniform [0, 1) draw for a key. */
export function hash01(seed: string | number, ...key: (string | number)[]): number {
  return rand(seed, ...key).next();
}
