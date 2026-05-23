# codex-auth-switch

OpenCode の Codex/OpenAI OAuth 認証情報を、プロファイルとして保存・復元する MVP CLI です。

実行時プロキシ、HTTP API、自動ローテーションはありません。タスク開始前に認証ファイルをコピーで切り替えます。

## 使い方

```sh
npm install
npm link

codex-auth-switch save plus1
codex-auth-switch save plus2
codex-auth-switch use plus1
codex-auth-switch list
codex-auth-switch current
```

OpenCode の auth ファイルを自動検出できない場合は明示してください。

```sh
codex-auth-switch save plus1 --auth-path ~/.local/share/opencode/auth.json
codex-auth-switch use plus1 --auth-path ~/.local/share/opencode/auth.json
```

または:

```sh
CODEX_AUTH_SWITCH_AUTH_PATH=~/.local/share/opencode/auth.json codex-auth-switch save plus1
```

## 保存場所

既定では以下に保存します。

```text
~/.config/opencode-codex-auth-switcher/
  profiles/<name>/auth.json
  profiles/<name>/metadata.json
  current.json
  backups/<timestamp>/auth.json
```

Windows では `APPDATA` 配下を優先します。`--store-dir` または `CODEX_AUTH_SWITCH_STORE_DIR` で変更できます。

## auth ファイル探索候補

`--auth-path` 未指定時は、存在する最初のパスを使います。

- `CODEX_AUTH_SWITCH_AUTH_PATH`
- `OPENCODE_AUTH_PATH`
- Windows: `%LOCALAPPDATA%\opencode\auth.json`
- Windows: `%APPDATA%\opencode\auth.json`
- `$XDG_DATA_HOME/opencode/auth.json`
- `$XDG_CONFIG_HOME/opencode/auth.json`
- `~/.config/opencode/auth.json`

## セーフティ

- トークン値は標準出力に出しません。
- profile 名は英数字・`.`・`_`・`-` のみに制限します。
- JSON として parse できない auth ファイルは保存・適用しません。
- `use` 前に現在の auth を `backups/` にコピーします。
- ディレクトリは `0700`、ファイルは `0600` を試行します（Windows では OS 依存）。

## 注意

`current` は「この CLI が最後に適用したプロファイル」です。OpenCode や手動編集による変更を厳密には検出しません。
