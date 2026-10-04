export type WellnessPrivateAuthority = {
  captureGeneration(): number;
  isActive(): boolean;
  isCurrent(generation: number): boolean;
  invalidate(): void;
  resume(): void;
  suspend(): void;
};

export function createWellnessPrivateAuthority(onInvalidate: () => void): WellnessPrivateAuthority {
  let active = true;
  let generation = 0;

  return {
    captureGeneration: () => generation,
    isActive: () => active,
    isCurrent: (capturedGeneration) => active && generation === capturedGeneration,
    invalidate: () => {
      if (!active) return;
      active = false;
      generation += 1;
      onInvalidate();
    },
    resume: () => {
      if (active) return;
      active = true;
      generation += 1;
    },
    suspend: () => {
      if (!active) return;
      active = false;
      generation += 1;
    },
  };
}
