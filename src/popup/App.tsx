import { useEffect, useState } from "react";
import type { VideoRecord, WatchSession } from "../types";
import { clearAllRecords, clearAllSessions, getAllSessions, getRecentRecords } from "../storage";

type CategoryTotals = Record<string, number>;

type Analytics = {
  todaySeconds: number;
  weekSeconds: number;
  languageTotals: CategoryTotals;
  genreTotals: CategoryTotals;
  purposeTotals: CategoryTotals;
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatWatchedTime(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return "1分未満";
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}分`;
  }

  return minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`;
}

function youtubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function startOfThisWeek(): number {
  const today = new Date(startOfToday());
  const day = today.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  today.setDate(today.getDate() - daysFromMonday);
  return today.getTime();
}

function addToTotals(totals: CategoryTotals, key: string, seconds: number): void {
  totals[key] = (totals[key] ?? 0) + seconds;
}

function buildAnalytics(sessions: WatchSession[]): Analytics {
  const todayStart = startOfToday();
  const weekStart = startOfThisWeek();
  const todaySessions = sessions.filter((session) => session.watchedAt >= todayStart);
  const weekSessions = sessions.filter((session) => session.watchedAt >= weekStart);

  const analytics: Analytics = {
    todaySeconds: todaySessions.reduce((total, session) => total + session.watchedSeconds, 0),
    weekSeconds: weekSessions.reduce((total, session) => total + session.watchedSeconds, 0),
    languageTotals: {},
    genreTotals: {},
    purposeTotals: {}
  };

  for (const session of todaySessions) {
    addToTotals(analytics.languageTotals, session.language, session.watchedSeconds);
    addToTotals(analytics.genreTotals, session.genre, session.watchedSeconds);
    addToTotals(analytics.purposeTotals, session.purpose, session.watchedSeconds);
  }

  return analytics;
}

function CategoryList({ title, totals }: { title: string; totals: CategoryTotals }) {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  return (
    <section className="analytics__group">
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="analytics__empty">記録なし</p>
      ) : (
        <ul>
          {entries.map(([label, seconds]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{formatWatchedTime(seconds)}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function App() {
  const [records, setRecords] = useState<VideoRecord[]>([]);
  const [sessions, setSessions] = useState<WatchSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadRecords() {
    setIsLoading(true);
    const [recentRecords, allSessions] = await Promise.all([getRecentRecords(20), getAllSessions()]);
    setRecords(recentRecords);
    setSessions(allSessions);
    setIsLoading(false);
  }

  async function handleClear() {
    const ok = window.confirm("保存済みデータをすべて削除しますか？");
    if (!ok) return;

    await Promise.all([clearAllRecords(), clearAllSessions()]);
    await loadRecords();
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  const analytics = buildAnalytics(sessions);
  const hasAnyData = records.length > 0 || sessions.length > 0;

  return (
    <main className="popup">
      <header className="popup__header">
        <div>
          <h1>YouTube Study Tracker</h1>
          <p>最近見た動画</p>
        </div>
        <button type="button" onClick={handleClear} disabled={!hasAnyData}>
          削除
        </button>
      </header>

      {isLoading ? (
        <p className="popup__empty">読み込み中...</p>
      ) : (
        <>
          <section className="analytics">
            <h2>分析</h2>
            <div className="analytics__summary">
              <div>
                <span>今日</span>
                <strong>{formatWatchedTime(analytics.todaySeconds)}</strong>
              </div>
              <div>
                <span>今週</span>
                <strong>{formatWatchedTime(analytics.weekSeconds)}</strong>
              </div>
            </div>
            <CategoryList title="今日の言語別" totals={analytics.languageTotals} />
            <CategoryList title="今日のジャンル別" totals={analytics.genreTotals} />
            <CategoryList title="今日の目的別" totals={analytics.purposeTotals} />
          </section>

          {records.length === 0 ? (
            <p className="popup__empty">まだ記録がありません。YouTubeの動画ページを開くと記録されます。</p>
          ) : (
            <ul className="record-list">
              {records.map((record) => (
                <li key={record.videoId} className="record">
                  <a href={youtubeUrl(record.videoId)} target="_blank" rel="noreferrer">
                    {record.title || record.videoId}
                  </a>
                  <div className="record__meta">
                    {record.viewCount}回視聴 / 通算視聴:{" "}
                    {formatWatchedTime(record.totalWatchedSeconds ?? 0)} / 最終視聴:{" "}
                    {formatDate(record.lastWatchedAt)}
                  </div>
                  <div className="record__meta">
                    {record.genre ?? "未分類"} / {record.language ?? "未設定"} /{" "}
                    {record.purpose ?? "未設定"}
                  </div>
                  {record.note.trim() && <p className="record__note">{record.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
