export function subscribeToRealtimeSms(
  _sync: () => Promise<unknown>,
  _reportError: (error: unknown) => void,
): () => void {
  return () => undefined;
}
