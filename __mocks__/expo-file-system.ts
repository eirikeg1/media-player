// Jest mock: the minimal expo-file-system surface the app touches in tests
// (Paths for DB locations, File for uploaded backgrounds). Registered in
// src/test/setup.ts to beat jest-expo's own legacy-API factory mock.
export const Paths = {
  document: { uri: '/test/' },
  cache: { uri: '/test-cache/' },
};

export class File {
  uri: string;

  constructor(...segments: string[]) {
    this.uri = segments.join('');
  }

  exists = false;

  delete(): void {}
}
