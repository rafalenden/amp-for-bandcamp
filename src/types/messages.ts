export interface FetchRequest {
  type: 'fetch';
  url: string;
}
export type FetchResponse = { data: number[] } | { error: string };
