// YouTube の再生履歴（Google Takeout の watch-history.json）から、TagTune にまだない音楽の動画を探して
// data/add-bulk.json に書き出す。次の取得（fetch.mjs の fetchManual）で詳細を取り、音楽の動画だけを追加して、一覧は空に戻る。
//   node scripts/import-history.mjs path/to/watch-history.json
// 履歴の中身（いつ・何を見たか）はリポジトリに残さない。書き出すのは動画のIDだけ
import { readFile, writeFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) { console.error("使い方: node scripts/import-history.mjs watch-history.json"); process.exit(1); }
const path = p => new URL("../" + p, import.meta.url);
const hist = JSON.parse(await readFile(file, "utf8"));
const known = new Set(JSON.parse(await readFile(path("data/songs.json"), "utf8")).map(i => i.id));
const pending = new Set(JSON.parse(await readFile(path("data/add-bulk.json"), "utf8").catch(() => "[]")));

// 音楽らしいタイトル（歌ってみた・cover・MV・歌声の名前など）。ゲーム実況・配信・切り抜きなどは除く
const MUSIC = /歌ってみた|歌わせて|cover|カバー|MV|Music Video|ミュージックビデオ|feat\.|初音ミク|重音テト|可不|鏡音|巡音|GUMI|flower|IA|オリジナル曲|official (audio|video)|Lyric|リリック|歌った|弾き語り|×.*【|Vo\.|オリジナル】|ft\./i;
const NOT = /実況|切り抜き|#shorts|配信|ゲーム|マイクラ|Minecraft|攻略|解説|レビュー|ニュース|vlog|料理|ASMR|雑談|まとめ|反応|ガチャ|ランク/i;

const seen = new Map();   // videoId -> { title, n }
for (const x of hist) {
  const v = (x.titleUrl || "").match(/[?&]v=([\w-]{11})/)?.[1];
  if (!v) continue;
  const title = String(x.title || "").replace(/ を視聴しました$/, "");
  const e = seen.get(v) || seen.set(v, { title, n: 0 }).get(v);
  e.n++;
}
const cand = [...seen].filter(([v, e]) => !known.has("yt:" + v) && !pending.has("yt:" + v) && !/^https?:/.test(e.title) && MUSIC.test(e.title) && !NOT.test(e.title))
  .sort((a, b) => b[1].n - a[1].n);
await writeFile(path("data/add-bulk.json"), JSON.stringify([...pending, ...cand.map(([v]) => "yt:" + v)]) + "\n");
console.log(`履歴 ${hist.length}件（動画 ${seen.size}本）のうち、TagTune にない音楽らしい動画 ${cand.length}本を data/add-bulk.json に入れました`);
console.log(cand.slice(0, 20).map(([, e]) => `  ${e.n}回 ${e.title.slice(0, 50)}`).join("\n"));
