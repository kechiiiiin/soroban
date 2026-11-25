# 算盤（soroban）

住宅ローン（購入）と賃貸の「もろもろ込みの総額」を比べる静的ページ。

- 比べるのはお金だけ。指定した年数分の総額（ローンの元利・諸費用・税金・管理修繕・保険・ローン控除／家賃・敷金礼金仲介・保証料・更新料・保険・引っ越し）を購入と賃貸で並べる
- 売却額は見ない。入力はすべて端末内の localStorage に保存（サーバーには送らない・ログイン不要）
- ビルドなし・依存なし。計算ロジックは `public/calc.js`（純粋関数・DOM に触れない）

## 開発

```sh
# ローカルで見る（calc.js は ES module なので file:// だと読めないことがある）
python3 -m http.server --directory public 8080

# テスト
node --test test/*.test.mjs
```

## 配置

Cloudflare Workers（Static Assets）想定。`wrangler.jsonc` の `assets.directory` は `./public`。

```sh
npx wrangler deploy
```

設計の経緯・仕様は jinsei vault の `hestia/projects/住宅ローンと賃貸の比較アプリ構想.md` を参照。
