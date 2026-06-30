// YouTube の動画ページに表示する小さなUIを作る content script です。
// Reactを使わず素のDOMで実装し、YouTubeページ内で安定して動かします。

type VideoRecord = {
  videoId: string;
  title: string;
  channelName: string;
  viewCount: number;
  lastWatchedAt: number;
  lastCountedAt: number;
  totalWatchedSeconds: number;
  note: string;
  genre: string;
  language: string;
  purpose: string;
};

type VideoRecordMap = Record<string, VideoRecord>;

type WatchSession = {
  id: string;
  videoId: string;
  channelName: string;
  watchedSeconds: number;
  watchedAt: number;
  genre: string;
  language: string;
  purpose: string;
};

type ChannelClassification = {
  channelName: string;
  genre: string;
  language: string;
  purpose: string;
  updatedAt: number;
};

type ChannelClassificationMap = Record<string, ChannelClassification>;

const STORAGE_KEY = "youtubeStudyTrackerRecords";
const SESSION_STORAGE_KEY = "youtubeStudyTrackerSessions";
const CHANNEL_CLASSIFICATION_STORAGE_KEY = "youtubeStudyTrackerChannelClassifications";
const ROOT_ID = "youtube-study-tracker-root";
const COUNT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_CHANNEL_NAME = "チャンネル未取得";
const DEFAULT_GENRE = "未分類";
const DEFAULT_LANGUAGE = "未設定";
const DEFAULT_PURPOSE = "未設定";
const GENRE_OPTIONS = ["未分類", "ゲーム実況", "プログラミング", "英語学習", "ニュース", "音楽", "その他"];
const LANGUAGE_OPTIONS = ["未設定", "日本語", "英語", "その他"];
const PURPOSE_OPTIONS = ["未設定", "学習", "娯楽", "作業用", "その他"];

let currentVideoId: string | null = null;
let saveTimer: number | undefined;
let trackedVideoElement: HTMLVideoElement | null = null;
let trackedVideoId: string | null = null;
let watchedStartedAt: number | null = null;
let renderRequestId = 0;

function getAllRecords(): Promise<VideoRecordMap> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as VideoRecordMap | undefined) ?? {});
    });
  });
}

function setAllRecords(records: VideoRecordMap): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: records }, () => resolve());
  });
}

function getAllSessions(): Promise<WatchSession[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSION_STORAGE_KEY, (result) => {
      resolve((result[SESSION_STORAGE_KEY] as WatchSession[] | undefined) ?? []);
    });
  });
}

function setAllSessions(sessions: WatchSession[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_STORAGE_KEY]: sessions }, () => resolve());
  });
}

function getAllChannelClassifications(): Promise<ChannelClassificationMap> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CHANNEL_CLASSIFICATION_STORAGE_KEY, (result) => {
      resolve((result[CHANNEL_CLASSIFICATION_STORAGE_KEY] as ChannelClassificationMap | undefined) ?? {});
    });
  });
}

function setAllChannelClassifications(classifications: ChannelClassificationMap): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CHANNEL_CLASSIFICATION_STORAGE_KEY]: classifications }, () => resolve());
  });
}

function normalizeRecord(record: VideoRecord): VideoRecord {
  return {
    ...record,
    title: record.title ?? record.videoId,
    channelName: record.channelName ?? DEFAULT_CHANNEL_NAME,
    totalWatchedSeconds: record.totalWatchedSeconds ?? 0,
    genre: record.genre ?? DEFAULT_GENRE,
    language: record.language ?? DEFAULT_LANGUAGE,
    purpose: record.purpose ?? DEFAULT_PURPOSE
  };
}

function isDefaultClassification(record: Pick<VideoRecord, "genre" | "language" | "purpose">): boolean {
  return (
    record.genre === DEFAULT_GENRE &&
    record.language === DEFAULT_LANGUAGE &&
    record.purpose === DEFAULT_PURPOSE
  );
}

function getVideoIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  if (url.hostname !== "www.youtube.com" || url.pathname !== "/watch") {
    return null;
  }
  return url.searchParams.get("v");
}

function getVideoIdFromDom(): string | null {
  const watchFlexyVideoId = document.querySelector("ytd-watch-flexy")?.getAttribute("video-id");
  if (watchFlexyVideoId) {
    return watchFlexyVideoId;
  }

  const metaVideoId = document.querySelector('meta[itemprop="videoId"]')?.getAttribute("content");
  return metaVideoId || null;
}

function getVideoTitle(): string {
  const candidates = [
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string"),
    document.querySelector("h1.title yt-formatted-string"),
    document.querySelector("h1")
  ];

  for (const candidate of candidates) {
    const title = candidate?.textContent?.trim();
    if (title) {
      return title;
    }
  }

  const pageTitle = document.title.replace(/\s*-\s*YouTube$/, "").trim();
  return pageTitle || "タイトル未取得";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForVideoMetadata(videoId: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 4000) {
    const domVideoId = getVideoIdFromDom();
    const title = getVideoTitle();

    if ((!domVideoId || domVideoId === videoId) && title !== "タイトル未取得") {
      return;
    }

    await sleep(100);
  }
}

function getChannelName(): string {
  const candidates = [
    document.querySelector("ytd-watch-metadata ytd-channel-name a"),
    document.querySelector("#upload-info #channel-name a"),
    document.querySelector("#owner ytd-channel-name a"),
    document.querySelector("ytd-video-owner-renderer ytd-channel-name a"),
    document.querySelector("#channel-name a")
  ];

  for (const candidate of candidates) {
    const channelName = candidate?.textContent?.trim();
    if (channelName) {
      return channelName;
    }
  }

  return DEFAULT_CHANNEL_NAME;
}

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

  return `${Math.floor(totalSeconds / 60)}分`;
}

function findInsertTarget(): Element {
  // 固定表示にするため、YouTube側のDOM構造に依存せずbodyへ追加します。
  return document.body;
}

function removeExistingRoot(): void {
  document.getElementById(ROOT_ID)?.remove();
}

async function loadOrCountRecord(videoId: string): Promise<VideoRecord> {
  const records = await getAllRecords();
  const now = Date.now();
  const channelName = getChannelName();
  const existing = records[videoId];
  const shouldCount = !existing || now - existing.lastCountedAt > COUNT_INTERVAL_MS;
  const normalized = existing ? normalizeRecord(existing) : null;
  const channelClassifications = await getAllChannelClassifications();
  const channelClassification = channelClassifications[channelName];
  const shouldUseChannelClassification =
    !!channelClassification && (!normalized || isDefaultClassification(normalized));
  const previousViewCount = normalized ? normalized.viewCount : 0;
  const previousLastCountedAt = normalized ? normalized.lastCountedAt : now;

  const record: VideoRecord = {
    videoId,
    title: getVideoTitle(),
    channelName,
    viewCount: shouldCount ? previousViewCount + 1 : previousViewCount,
    lastWatchedAt: now,
    lastCountedAt: shouldCount ? now : previousLastCountedAt,
    totalWatchedSeconds: normalized?.totalWatchedSeconds ?? 0,
    note: normalized?.note ?? "",
    genre: shouldUseChannelClassification ? channelClassification.genre : (normalized?.genre ?? DEFAULT_GENRE),
    language: shouldUseChannelClassification
      ? channelClassification.language
      : (normalized?.language ?? DEFAULT_LANGUAGE),
    purpose: shouldUseChannelClassification ? channelClassification.purpose : (normalized?.purpose ?? DEFAULT_PURPOSE)
  };

  records[videoId] = record;
  await setAllRecords(records);
  return record;
}

async function saveNote(videoId: string, note: string): Promise<void> {
  const records = await getAllRecords();
  const existing = records[videoId];
  if (!existing) return;
  const normalized = normalizeRecord(existing);
  const currentChannelName = getChannelName();

  records[videoId] = {
    ...normalized,
    title: getVideoTitle(),
    channelName: currentChannelName === DEFAULT_CHANNEL_NAME ? normalized.channelName : currentChannelName,
    note
  };
  await setAllRecords(records);
}

async function saveChannelClassification(
  channelName: string,
  classification: Pick<VideoRecord, "genre" | "language" | "purpose">
): Promise<void> {
  if (channelName === DEFAULT_CHANNEL_NAME) return;

  const classifications = await getAllChannelClassifications();
  classifications[channelName] = {
    channelName,
    ...classification,
    updatedAt: Date.now()
  };
  await setAllChannelClassifications(classifications);
}

async function saveClassification(
  videoId: string,
  classification: Pick<VideoRecord, "genre" | "language" | "purpose">
): Promise<void> {
  const records = await getAllRecords();
  const existing = records[videoId];
  if (!existing) return;
  const normalized = normalizeRecord(existing);
  const currentChannelName = getChannelName();

  records[videoId] = {
    ...normalized,
    title: getVideoTitle(),
    channelName: currentChannelName === DEFAULT_CHANNEL_NAME ? normalized.channelName : currentChannelName,
    ...classification
  };
  await setAllRecords(records);
  await saveChannelClassification(records[videoId].channelName, classification);
}

function createSession(videoId: string, seconds: number, record: VideoRecord): WatchSession {
  return {
    id: `${videoId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    videoId,
    channelName: record.channelName,
    watchedSeconds: seconds,
    watchedAt: Date.now(),
    genre: record.genre,
    language: record.language,
    purpose: record.purpose
  };
}

async function addWatchedSeconds(videoId: string, seconds: number): Promise<VideoRecord | null> {
  if (seconds < 1) return null;

  const records = await getAllRecords();
  const existing = records[videoId];
  if (!existing) return null;
  const normalized = normalizeRecord(existing);

  const updated: VideoRecord = {
    ...normalized,
    channelName: normalized.channelName ?? DEFAULT_CHANNEL_NAME,
    totalWatchedSeconds: normalized.totalWatchedSeconds + seconds
  };
  records[videoId] = updated;
  await setAllRecords(records);

  const sessions = await getAllSessions();
  sessions.push(createSession(videoId, seconds, updated));
  await setAllSessions(sessions);

  return updated;
}

function updateWatchedTimeText(totalSeconds: number): void {
  const watchedTime = document.getElementById("youtube-study-tracker-watched-time");
  if (!watchedTime) return;

  watchedTime.textContent = `通算視聴: ${formatWatchedTime(totalSeconds)}`;
}

async function flushWatchedTime(keepRunning = false): Promise<void> {
  if (!trackedVideoId || watchedStartedAt === null) return;

  const seconds = Math.floor((Date.now() - watchedStartedAt) / 1000);
  watchedStartedAt =
    keepRunning && trackedVideoElement && !trackedVideoElement.paused ? Date.now() : null;

  const updated = await addWatchedSeconds(trackedVideoId, seconds);
  if (updated) {
    updateWatchedTimeText(updated.totalWatchedSeconds);
  }
}

function startWatchedTimer(): void {
  if (watchedStartedAt !== null) return;
  watchedStartedAt = Date.now();
}

function stopTrackingVideoElement(): void {
  if (!trackedVideoElement) return;

  trackedVideoElement.removeEventListener("play", startWatchedTimer);
  trackedVideoElement.removeEventListener("pause", handleVideoPaused);
  trackedVideoElement.removeEventListener("ended", handleVideoPaused);
  trackedVideoElement = null;
}

function handleVideoPaused(): void {
  void flushWatchedTime();
}

function findVideoElement(): HTMLVideoElement | null {
  return document.querySelector("video");
}

function trackVideoPlayback(videoId: string): void {
  const video = findVideoElement();
  if (!video) return;

  if (trackedVideoElement === video && trackedVideoId === videoId) {
    return;
  }

  void flushWatchedTime();
  stopTrackingVideoElement();

  trackedVideoElement = video;
  trackedVideoId = videoId;
  watchedStartedAt = video.paused ? null : Date.now();

  video.addEventListener("play", startWatchedTimer);
  video.addEventListener("pause", handleVideoPaused);
  video.addEventListener("ended", handleVideoPaused);
}

function createSelectControl(
  labelText: string,
  value: string,
  options: string[],
  onChange: (value: string) => void
): HTMLElement {
  const label = document.createElement("label");
  label.style.cssText = "display:grid;gap:4px;font-size:12px;color:#527067;";

  const labelTitle = document.createElement("span");
  labelTitle.textContent = labelText;

  const select = document.createElement("select");
  select.value = value;
  select.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "padding:6px",
    "border:1px solid #bfe8d0",
    "border-radius:6px",
    "background:#f7fbf8",
    "color:#17342c",
    "font:inherit"
  ].join(";");

  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    select.append(option);
  }

  select.addEventListener("change", () => onChange(select.value));
  label.append(labelTitle, select);
  return label;
}

function createTrackerUi(record: VideoRecord): HTMLElement {
  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.style.cssText = [
    "box-sizing:border-box",
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "width:320px",
    "max-width:calc(100vw - 32px)",
    "max-height:calc(100vh - 32px)",
    "overflow:auto",
    "padding:12px",
    "border:1px solid #bfe8d0",
    "border-radius:8px",
    "background:linear-gradient(180deg,#ffffff 0%,#f3fbf6 100%)",
    "color:#17342c",
    "box-shadow:0 10px 28px rgba(21,91,68,0.22)",
    "font-family:Arial, sans-serif",
    "font-size:14px",
    "line-height:1.5"
  ].join(";");

  const title = document.createElement("strong");
  title.textContent = "YouTube Study Tracker";
  title.style.display = "block";
  title.style.marginBottom = "8px";
  title.style.color = "#0f513f";

  const count = document.createElement("div");
  count.textContent = `この動画は ${record.viewCount} 回視聴`;
  count.style.cssText = [
    "margin-top:8px",
    "padding:7px 8px",
    "border:1px solid #c8efd8",
    "border-radius:6px",
    "background:#e8f8ef",
    "color:#0f513f",
    "font-weight:700"
  ].join(";");

  const videoTitle = document.createElement("div");
  videoTitle.textContent = record.title;
  videoTitle.style.cssText = [
    "margin-bottom:6px",
    "font-weight:700",
    "color:#116149",
    "overflow-wrap:anywhere",
    "display:-webkit-box",
    "-webkit-line-clamp:2",
    "-webkit-box-orient:vertical",
    "overflow:hidden"
  ].join(";");

  const channelName = document.createElement("div");
  channelName.textContent = `チャンネル: ${record.channelName}`;
  channelName.style.cssText = "margin-bottom:6px;color:#527067;font-size:12px;overflow-wrap:anywhere;";

  const watchedAt = document.createElement("div");
  watchedAt.textContent = `最終視聴: ${formatDate(record.lastWatchedAt)}`;
  watchedAt.style.cssText = "margin-top:6px;color:#527067;font-size:12px;";

  const watchedTime = document.createElement("div");
  watchedTime.id = "youtube-study-tracker-watched-time";
  watchedTime.textContent = `通算視聴: ${formatWatchedTime(record.totalWatchedSeconds)}`;
  watchedTime.style.cssText = "color:#527067;font-size:12px;";

  const status = document.createElement("div");
  status.textContent = "メモは自動保存されます";
  status.style.cssText = "margin-top:6px;color:#527067;font-size:12px;";

  const classification = {
    genre: record.genre,
    language: record.language,
    purpose: record.purpose
  };

  const classificationControls = document.createElement("div");
  classificationControls.style.cssText = [
    "display:grid",
    "grid-template-columns:repeat(3,minmax(0,1fr))",
    "gap:8px",
    "margin-top:10px"
  ].join(";");

  const saveClassificationChange = async () => {
    status.textContent = "保存中...";
    await saveClassification(record.videoId, classification);
    status.textContent = "保存しました";
  };

  classificationControls.append(
    createSelectControl("ジャンル", record.genre, GENRE_OPTIONS, (value) => {
      classification.genre = value;
      void saveClassificationChange();
    }),
    createSelectControl("言語", record.language, LANGUAGE_OPTIONS, (value) => {
      classification.language = value;
      void saveClassificationChange();
    }),
    createSelectControl("目的", record.purpose, PURPOSE_OPTIONS, (value) => {
      classification.purpose = value;
      void saveClassificationChange();
    })
  );

  const note = document.createElement("textarea");
  note.value = record.note;
  note.placeholder = "この動画のメモ";
  note.rows = 4;
  note.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "margin-top:10px",
    "padding:8px",
    "border:1px solid #bfe8d0",
    "border-radius:6px",
    "background:#fff",
    "color:#17342c",
    "resize:vertical",
    "font:inherit"
  ].join(";");

  note.addEventListener("input", () => {
    window.clearTimeout(saveTimer);
    status.textContent = "保存中...";
    saveTimer = window.setTimeout(async () => {
      await saveNote(record.videoId, note.value);
      status.textContent = "保存しました";
    }, 500);
  });

  root.append(title, videoTitle, channelName, count, watchedAt, watchedTime, classificationControls, note, status);
  return root;
}

async function renderForCurrentVideo(): Promise<void> {
  const requestId = ++renderRequestId;
  const videoId = getVideoIdFromUrl();
  if (!videoId) {
    await flushWatchedTime();
    stopTrackingVideoElement();
    trackedVideoId = null;
    currentVideoId = null;
    removeExistingRoot();
    return;
  }

  if (videoId === currentVideoId && document.getElementById(ROOT_ID)) {
    trackVideoPlayback(videoId);
    return;
  }

  await flushWatchedTime();
  await waitForVideoMetadata(videoId);

  if (requestId !== renderRequestId || getVideoIdFromUrl() !== videoId) {
    return;
  }

  currentVideoId = videoId;
  const record = await loadOrCountRecord(videoId);
  removeExistingRoot();
  findInsertTarget().append(createTrackerUi(record));
  trackVideoPlayback(videoId);
}

function watchUrlChanges(): void {
  // YouTubeはSPAなので、通常のページ遷移なしでURLだけ変わることがあります。
  const notify = () => window.dispatchEvent(new Event("youtube-study-tracker-url-change"));
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    notify();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    notify();
  };

  window.addEventListener("popstate", notify);
  window.addEventListener("youtube-study-tracker-url-change", () => {
    window.setTimeout(renderForCurrentVideo, 600);
  });
}

function watchDomChanges(): void {
  // YouTube側の描画が遅れて挿入先が後から出る場合に備えます。
  const observer = new MutationObserver(() => {
    void renderForCurrentVideo();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    void flushWatchedTime(true);
  } else if (trackedVideoElement && !trackedVideoElement.paused) {
    startWatchedTimer();
  }
});

window.addEventListener("pagehide", () => {
  void flushWatchedTime();
});

watchUrlChanges();
watchDomChanges();
void renderForCurrentVideo();
