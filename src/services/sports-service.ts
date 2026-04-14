import { Paths } from 'expo-file-system';
import { SportsDatabase } from 'expo-m3u-parser';

const DB_NAME = 'sports.db';

let sportsDb: SportsDatabase | null = null;

function getDatabasePath(): string {
  return Paths.document.uri + DB_NAME;
}

export async function getSportsDatabase(): Promise<SportsDatabase> {
  if (sportsDb) return sportsDb;

  const path = getDatabasePath();
  sportsDb = await SportsDatabase.open(path);
  return sportsDb;
}
