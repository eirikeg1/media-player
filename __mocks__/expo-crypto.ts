// Automatic Jest mock: expo-crypto's native randomUUID via Node's crypto.
import { randomUUID as nodeRandomUUID } from 'crypto';

export function randomUUID(): string {
  return nodeRandomUUID();
}
