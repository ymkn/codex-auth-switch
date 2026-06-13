# AGENTS.md

このリポジトリは、OpenCode の Codex/OpenAI OAuth `auth.json` をプロファイルとして保存・復元する最小CLIです。実行時プロキシや自動ローテーションは扱いません。

## 開発コマンド

- 依存導入: `npm install`
- CLIを直接起動: `npm start -- <command>` または `node ./bin/codex-auth-switch.js <command>`
- ローカルで `codex-auth-switch` コマンドを使う: `npm link`
- 全テスト: `npm test`（実体は `node --test`）
- 単一テストファイル: `node --test test/cli.test.js`

## 構成

- CLIエントリポイントは `bin/codex-auth-switch.js`。`package.json` の `bin` もここを指します。
- テストは `test/cli.test.js` の `node:test` ベースのみです。
- Node.js は `>=18.17` 前提、ESM（`"type": "module"`）です。
- lockfile、lint/format/typecheck設定、CI設定は現時点ではありません。

## 実装上の注意

- auth切替は symlink ではなくファイルコピー方式を維持してください。Windows権限やOpenCode側の上書き挙動を避けるためです。
- `save`/`use` は auth ファイルをJSONとしてparseできることを確認し、symlinkや通常ファイルでない入力を拒否します。
- `use` 前には現在の auth を `backups/last/` にコピーします。古い世代バックアップは削除され、直近1世代のみ保持します。この安全策を外さないでください。
- profile名は `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` と `.`/`..` 拒否でパストラバーサルを防いでいます。
- トークン値は標準出力・ログ・テスト失敗メッセージ・Issue/PR本文に出さないでください。
- `current` は「このCLIが最後に適用したプロファイル」であり、OpenCodeや手動編集による外部変更の厳密な検出ではありません。

## auth/store パス

- authパスの明示指定は `--auth-path` または `CODEX_AUTH_SWITCH_AUTH_PATH`。`OPENCODE_AUTH_PATH` も候補に入ります。
- storeディレクトリの明示指定は `--store-dir` または `CODEX_AUTH_SWITCH_STORE_DIR`。
- 既定storeは `defaultStoreDir()` を確認してください。Windowsは `APPDATA`、それ以外は `XDG_CONFIG_HOME` または `~/.config` 配下です。
- auth探索候補の順序は `authPathCandidates()` と README の「auth ファイル探索候補」を同期させてください。

## 変更時の確認

- CLI挙動や安全策を変えたら `npm test` を実行してください。
- auth探索候補、保存場所、CLI引数を変えたら README も更新してください。
