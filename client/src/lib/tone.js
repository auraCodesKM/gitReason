const TONES = ["accent", "amber", "blue", "cyan"];

// Deterministic - the same repo always gets the same tone, so it stays
// recognizable across renders instead of shuffling.
export function toneForKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}
