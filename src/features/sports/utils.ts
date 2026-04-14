export function teamKey(provider: string, providerId: number): string {
  return `${provider}-${providerId}`;
}
