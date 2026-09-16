export function analyzeFullBuffer(
  buffer: AudioBuffer,
): Promise<Array<{ tempo: number; count: number }>>;
