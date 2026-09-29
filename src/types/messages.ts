export type BpmResult = {
  type: 'bpm-result';
  requestId: string;
} & ({ bpm: number } | { error: string });

export type AudioDownloadMessage =
  | { type: 'chunk'; data: string }
  | { type: 'complete' }
  | { type: 'error'; error: string };
