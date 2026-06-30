import { useEffect, useState } from "react";
import {
  GENRE_OPTIONS,
  LANGUAGE_OPTIONS,
  PURPOSE_OPTIONS,
  type ChannelClassification,
  type ChannelClassificationMap,
  type VideoRecord,
  type WatchSession
} from "../types";
import {
  clearAllChannelClassifications,
  clearAllRecords,
  clearAllSessions,
  deleteChannelClassification,
  getAllChannelClassifications,
  getAllSessions,
  getRecentRecords,
  saveChannelClassification
} from "../storage";

type TabId = "analytics" | "history" | "classification" | "settings";
type CategoryTotals = Record<string, number>;

type Analytics = {
  todaySeconds: number;
  weekSeconds: number;
  languageTotals: CategoryTotals;
  genreTotals: CategoryTotals;
  purposeTotals: CategoryTotals;
  todayChannelTotals: CategoryTotals;
  weekChannelTotals: CategoryTotals;
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
    purposeTotals: {},
    todayChannelTotals: {},
    weekChannelTotals: {}
  };

  for (const session of todaySessions) {
    addToTotals(analytics.languageTotals, session.language, session.watchedSeconds);
    addToTotals(analytics.genreTotals, session.genre, session.watchedSeconds);
    addToTotals(analytics.purposeTotals, session.purpose, session.watchedSeconds);
    addToTotals(analytics.todayChannelTotals, session.channelName ?? "チャンネル未取得", session.watchedSeconds);
  }

  for (const session of weekSessions) {
    addToTotals(analytics.weekChannelTotals, session.channelName ?? "チャンネル未取得", session.watchedSeconds);
  }

  return analytics;
}

function CategoryList({ title, totals, limit }: { title: string; totals: CategoryTotals; limit?: number }) {
  const entries = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

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

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="classification-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("analytics");
  const [records, setRecords] = useState<VideoRecord[]>([]);
  const [sessions, setSessions] = useState<WatchSession[]>([]);
  const [channelClassifications, setChannelClassifications] = useState<ChannelClassification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadRecords() {
    setIsLoading(true);
    const [recentRecords, allSessions, allChannelClassifications] = await Promise.all([
      getRecentRecords(20),
      getAllSessions(),
      getAllChannelClassifications()
    ]);
    setRecords(recentRecords);
    setSessions(allSessions);
    setChannelClassifications(sortChannelClassifications(allChannelClassifications));
    setIsLoading(false);
  }

  async function handleClear() {
    const ok = window.confirm("保存済みデータをすべて削除しますか？");
    if (!ok) return;

    await Promise.all([clearAllRecords(), clearAllSessions(), clearAllChannelClassifications()]);
    await loadRecords();
  }

  async function handleChannelClassificationChange(
    channelName: string,
    updates: Partial<Pick<ChannelClassification, "genre" | "language" | "purpose">>
  ) {
    const current = channelClassifications.find((classification) => classification.channelName === channelName);
    if (!current) return;

    const updated: ChannelClassification = {
      ...current,
      ...updates,
      updatedAt: Date.now()
    };

    await saveChannelClassification(updated);
    const allChannelClassifications = await getAllChannelClassifications();
    setChannelClassifications(sortChannelClassifications(allChannelClassifications));
  }

  async function handleDeleteChannelClassification(channelName: string) {
    const ok = window.confirm("このチャンネル分類を削除しますか？");
    if (!ok) return;

    await deleteChannelClassification(channelName);
    const allChannelClassifications = await getAllChannelClassifications();
    setChannelClassifications(sortChannelClassifications(allChannelClassifications));
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  const analytics = buildAnalytics(sessions);
  const hasAnyData = records.length > 0 || sessions.length > 0 || channelClassifications.length > 0;

  return (
    <main className="popup">
      <header className="popup__header">
        <div>
          <h1>YouTube Study Tracker</h1>
          <p>最近見た動画</p>
        </div>
      </header>

      <nav className="tabs" aria-label="popup sections">
        <button
          type="button"
          className={activeTab === "analytics" ? "tabs__button tabs__button--active" : "tabs__button"}
          onClick={() => setActiveTab("analytics")}
        >
          分析
        </button>
        <button
          type="button"
          className={activeTab === "history" ? "tabs__button tabs__button--active" : "tabs__button"}
          onClick={() => setActiveTab("history")}
        >
          履歴
        </button>
        <button
          type="button"
          className={activeTab === "classification" ? "tabs__button tabs__button--active" : "tabs__button"}
          onClick={() => setActiveTab("classification")}
        >
          分類
        </button>
        <button
          type="button"
          className={activeTab === "settings" ? "tabs__button tabs__button--active" : "tabs__button"}
          onClick={() => setActiveTab("settings")}
        >
          設定
        </button>
      </nav>

      {isLoading ? (
        <p className="popup__empty">読み込み中...</p>
      ) : activeTab === "analytics" ? (
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
            <CategoryList title="今日のチャンネル別" totals={analytics.todayChannelTotals} limit={5} />
            <CategoryList title="今週のチャンネル別" totals={analytics.weekChannelTotals} limit={5} />
          </section>
      ) : activeTab === "history" ? (
        records.length === 0 ? (
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
                <div className="record__meta">チャンネル: {record.channelName ?? "チャンネル未取得"}</div>
                <div className="record__meta">
                  {record.genre ?? "未分類"} / {record.language ?? "未設定"} /{" "}
                  {record.purpose ?? "未設定"}
                </div>
                {record.note.trim() && <p className="record__note">{record.note}</p>}
              </li>
            ))}
          </ul>
        )
      ) : activeTab === "settings" ? (
        <section className="settings">
          <h2>設定</h2>

          <section className="settings-card">
            <h3>保存データ</h3>
            <dl className="settings-stats">
              <div>
                <dt>動画記録</dt>
                <dd>{records.length}件</dd>
              </div>
              <div>
                <dt>視聴セッション</dt>
                <dd>{sessions.length}件</dd>
              </div>
              <div>
                <dt>チャンネル分類</dt>
                <dd>{channelClassifications.length}件</dd>
              </div>
            </dl>
          </section>

          <section className="settings-card settings-card--muted">
            <h3>今後追加予定</h3>
            <ul className="settings-upcoming">
              <li>週始まり設定</li>
              <li>履歴表示件数</li>
              <li>記録パネルの表示位置</li>
              <li>データエクスポート</li>
              <li>データインポート</li>
            </ul>
          </section>

          <section className="settings-card settings-card--danger">
            <h3>データ管理</h3>
            <p>保存済みの動画記録、視聴セッション、チャンネル分類を削除します。</p>
            <button type="button" onClick={handleClear} disabled={!hasAnyData}>
              全履歴削除
            </button>
          </section>
        </section>
      ) : (
        <section className="classification">
          <h2>チャンネル分類</h2>
          <p className="classification__help">
            ここで変更した分類は、今後開く未分類動画の初期値として使われます。
          </p>
          {channelClassifications.length === 0 ? (
            <p className="popup__empty">まだチャンネル分類はありません。動画ページで分類を選ぶと保存されます。</p>
          ) : (
            <ul className="classification-list">
              {channelClassifications.map((classification) => (
                <li key={classification.channelName} className="classification-card">
                  <div className="classification-card__header">
                    <strong>{classification.channelName}</strong>
                    <button
                      type="button"
                      className="classification-card__delete"
                      onClick={() => void handleDeleteChannelClassification(classification.channelName)}
                    >
                      削除
                    </button>
                  </div>
                  <div className="classification-card__fields">
                    <SelectField
                      label="ジャンル"
                      value={classification.genre}
                      options={GENRE_OPTIONS}
                      onChange={(value) =>
                        void handleChannelClassificationChange(classification.channelName, { genre: value })
                      }
                    />
                    <SelectField
                      label="言語"
                      value={classification.language}
                      options={LANGUAGE_OPTIONS}
                      onChange={(value) =>
                        void handleChannelClassificationChange(classification.channelName, { language: value })
                      }
                    />
                    <SelectField
                      label="目的"
                      value={classification.purpose}
                      options={PURPOSE_OPTIONS}
                      onChange={(value) =>
                        void handleChannelClassificationChange(classification.channelName, { purpose: value })
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

function sortChannelClassifications(classifications: ChannelClassificationMap): ChannelClassification[] {
  return Object.values(classifications).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
