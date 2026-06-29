import {
  DEFAULT_GENRE,
  DEFAULT_LANGUAGE,
  DEFAULT_PURPOSE,
  type VideoRecord,
  type VideoRecordMap,
  type WatchSession
} from "./types";

const STORAGE_KEY = "youtubeStudyTrackerRecords";
const SESSION_STORAGE_KEY = "youtubeStudyTrackerSessions";

// chrome.storage.local を Promise で扱えるようにする小さな補助関数です。
function getFromStorage<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

function setToStorage<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

export async function getAllRecords(): Promise<VideoRecordMap> {
  const records = (await getFromStorage<VideoRecordMap>(STORAGE_KEY)) ?? {};
  return Object.fromEntries(
    Object.entries(records).map(([videoId, record]) => [
      videoId,
      {
        ...record,
        title: record.title ?? videoId,
        totalWatchedSeconds: record.totalWatchedSeconds ?? 0,
        genre: record.genre ?? DEFAULT_GENRE,
        language: record.language ?? DEFAULT_LANGUAGE,
        purpose: record.purpose ?? DEFAULT_PURPOSE
      }
    ])
  );
}

export async function getRecentRecords(limit = 20): Promise<VideoRecord[]> {
  const records = await getAllRecords();
  return Object.values(records)
    .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
    .slice(0, limit);
}

export async function saveRecord(record: VideoRecord): Promise<void> {
  const records = await getAllRecords();
  records[record.videoId] = record;
  await setToStorage(STORAGE_KEY, records);
}

export async function updateNote(videoId: string, note: string): Promise<void> {
  const records = await getAllRecords();
  const current = records[videoId];
  if (!current) return;

  records[videoId] = {
    ...current,
    note
  };
  await setToStorage(STORAGE_KEY, records);
}

export async function updateClassification(
  videoId: string,
  classification: Pick<VideoRecord, "genre" | "language" | "purpose">
): Promise<void> {
  const records = await getAllRecords();
  const current = records[videoId];
  if (!current) return;

  records[videoId] = {
    ...current,
    ...classification
  };
  await setToStorage(STORAGE_KEY, records);
}

export async function getAllSessions(): Promise<WatchSession[]> {
  return (await getFromStorage<WatchSession[]>(SESSION_STORAGE_KEY)) ?? [];
}

export async function addWatchSession(session: WatchSession): Promise<void> {
  const sessions = await getAllSessions();
  sessions.push(session);
  await setToStorage(SESSION_STORAGE_KEY, sessions);
}

export async function clearAllRecords(): Promise<void> {
  await setToStorage(STORAGE_KEY, {});
}

export async function clearAllSessions(): Promise<void> {
  await setToStorage(SESSION_STORAGE_KEY, []);
}
