export type Prng = Readonly<{
  nextUint32: () => number;
  nextFloat: () => number;
  nextInt: (exclusiveMax: number) => number;
}>;

function seedToUint32(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createPrng(seed: string): Prng {
  let state = seedToUint32(seed) || 0x6d2b79f5;
  const nextUint32 = (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0);
  };
  return {
    nextUint32,
    nextFloat: () => nextUint32() / 4294967296,
    nextInt: (exclusiveMax: number) => {
      if (exclusiveMax <= 0 || !Number.isFinite(exclusiveMax)) {
        throw new Error("exclusiveMax must be positive");
      }
      return Math.floor((nextUint32() / 4294967296) * exclusiveMax);
    },
  };
}

export function shuffleDeterministic<T>(input: readonly T[], seed: string): readonly T[] {
  const prng = createPrng(seed);
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = prng.nextInt(index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}
