// 動画ごとに chrome.storage.local へ保存するデータの型です。
export type VideoRecord = {
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

// storage 全体の形です。キーは YouTube の videoId です。
export type VideoRecordMap = Record<string, VideoRecord>;

// 再生時間を保存するたびに追加する履歴です。期間別集計に使います。
export type WatchSession = {
  id: string;
  videoId: string;
  channelName: string;
  watchedSeconds: number;
  watchedAt: number;
  genre: string;
  language: string;
  purpose: string;
};

// チャンネルごとに前回選んだ分類を覚えて、次回の初期値に使います。
export type ChannelClassification = {
  channelName: string;
  genre: string;
  language: string;
  purpose: string;
  updatedAt: number;
};

export type ChannelClassificationMap = Record<string, ChannelClassification>;

export const GENRE_OPTIONS = ["未分類", "ゲーム実況", "プログラミング", "英語学習", "ニュース", "音楽", "その他"];
export const LANGUAGE_OPTIONS = ["未設定", "日本語", "英語", "その他"];
export const PURPOSE_OPTIONS = ["未設定", "学習", "娯楽", "作業用", "その他"];

export const DEFAULT_GENRE = "未分類";
export const DEFAULT_LANGUAGE = "未設定";
export const DEFAULT_PURPOSE = "未設定";
export const DEFAULT_CHANNEL_NAME = "チャンネル未取得";
