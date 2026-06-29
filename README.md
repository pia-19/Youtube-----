# YouTube Study Tracker

Chrome Extension Manifest V3で作る、YouTube学習動画の視聴記録ツールです。動画タイトル、視聴回数、最終視聴日時、通算視聴時間、分類、メモをサーバーなしで `chrome.storage.local` に保存します。

動画ごとにジャンル、言語、目的を手動分類できます。再生時間は視聴セッションとしても保存され、popupで今日・今週の合計や、今日のカテゴリ別視聴時間を確認できます。

## ディレクトリ構成

```text
.
├── public/manifest.json      # Chrome拡張機能の設定。Viteビルド時にdistへコピーされます。
├── popup.html                # popup画面のHTML入口。
├── src/content.ts            # YouTube動画ページへUIを挿入するcontent script。
├── src/popup/App.tsx         # 最近見た動画一覧を表示するReactコンポーネント。
├── src/popup/main.tsx        # popup用Reactアプリの起動ファイル。
├── src/popup/style.css       # popup画面のスタイル。
├── src/storage.ts            # chrome.storage.localを扱うユーティリティ。
├── src/types.ts              # 保存データのTypeScript型定義。
├── vite.config.ts            # Viteのビルド設定。
└── tsconfig.json             # TypeScript設定。
```

## 開発・ビルド手順

```bash
npm install
npm run build
```

- `npm install`: 必要なライブラリをインストールします。
- `npm run build`: TypeScriptの型チェック後、`dist/` にChromeへ読み込むファイルを生成します。
- `npm run dev`: popupの見た目確認用です。Chrome拡張として読み込む場合は `npm run build` を使います。

## Chromeへの読み込み

1. Chromeで `chrome://extensions` を開きます。
2. 右上の「デベロッパーモード」をオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」を押します。
4. このプロジェクトの `dist/` フォルダを選択します。
5. YouTubeの動画ページ `https://www.youtube.com/watch?v=...` を開きます。

## 初心者向けの動作確認

1. YouTube動画ページの右側または本文付近に `YouTube Study Tracker` が表示されることを確認します。
2. 「この動画は 1 回視聴」と表示されることを確認します。
3. 動画を再生して少し待ち、一時停止後に「通算視聴」が増えることを確認します。
4. 一時停止中に待っても、通算視聴時間が増えないことを確認します。
5. ジャンル、言語、目的を選択し、「保存しました」と出ることを確認します。
6. ページをリロードしても、選択した分類が保持されることを確認します。
7. メモ欄に文字を入力し、「保存しました」と出ることを確認します。
8. 拡張機能アイコンを押し、popupに「分析」と最近見た動画タイトルが表示されることを確認します。
9. popupで今日・今週の合計視聴時間、今日の言語別、ジャンル別、目的別の時間を確認します。
10. 同じ動画を短時間でリロードしても、視聴回数が増え続けないことを確認します。
11. popupの「削除」ボタンで動画記録と視聴セッションが消えることを確認します。

## よくあるエラーと対処法

- `dist` が見つからない: 先に `npm run build` を実行してください。
- popupに何も出ない: `chrome://extensions` で拡張機能を再読み込みしてください。
- YouTube上にUIが出ない: 動画ページのURLが `/watch?v=...` になっているか確認してください。
- 変更が反映されない: `npm run build` 後、Chrome拡張機能ページで再読み込みしてください。
- `chrome is not defined`: 通常のブラウザページで直接開いています。Chrome拡張として `dist/` を読み込んでください。
