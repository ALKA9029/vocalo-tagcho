// 曲データを集めて data/songs.json を更新する。
//   node scripts/fetch.mjs                      … ニコニコとYouTubeから取得
//   node scripts/fetch.mjs --fixture FILE.json  … ネットにつながず、テスト用データで動かす
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { classify, linkCovers } from "./classify.mjs";

const ROOT = new URL("..", import.meta.url);
const path = p => new URL(p, ROOT);
const config = JSON.parse(await readFile(path("config.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(path(p), "utf8")); } catch { return fallback; }
}

// ---------- ニコニコ（スナップショット検索API v2） ----------
// seed=true のときは日付で絞らず、config の seedQueries（昔からの人気曲）を取りにいく
async function fetchNiconico(seed) {
  const nc = config.niconico;
  const since = new Date(Date.now() - nc.lookbackDays * 864e5).toISOString().replace(/\.\d+Z$/, "+00:00");
  const out = [];
  for (const q of seed ? nc.seedQueries : nc.queries) {
    for (let page = 0; page < (q.maxPages || 1); page++) {
      const params = new URLSearchParams({
        q: q.q, targets: q.targets,
        fields: "contentId,title,tags,startTime,viewCounter,likeCounter,thumbnailUrl,userId,channelId",
        ...(seed ? {} : { "filters[startTime][gte]": since }),
        "filters[viewCounter][gte]": String(q.minViews || 0),
        _sort: "-viewCounter", _offset: String(page * 100), _limit: "100",
        _context: "vocalo-tagcho",
      });
      const url = "https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?" + params;
      const started = Date.now();
      const res = await fetch(url, { headers: { "User-Agent": config.userAgent } });
      if (!res.ok) { console.warn(`ニコニコ「${q.label}」: HTTP ${res.status}、このページは飛ばします`); break; }
      const body = await res.json();
      const rows = body.data || [];
      for (const r of rows) out.push({
        src: "niconico", id: "nico:" + r.contentId, url: "https://www.nicovideo.jp/watch/" + r.contentId,
        title: r.title || "", tags: (r.tags || "").split(" ").filter(Boolean),
        date: r.startTime, views: r.viewCounter, likes: r.likeCounter, thumb: r.thumbnailUrl,
        uploaderId: r.userId ?? r.channelId ?? null, seed: seed || undefined,
      });
      console.log(`ニコニコ「${q.label}」${page + 1}ページ目: ${rows.length}件`);
      // 利用ルール：前のリクエストにかかった時間以上あけて次を送る
      await sleep(Math.max(1000, Date.now() - started));
      if (rows.length < 100) break;
    }
  }
  return out;
}

// ---------- YouTube（チャンネルごとのRSS、APIキー不要） ----------
const unxml = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const pick = (s, re) => (s.match(re) || [])[1];

async function fetchYouTube() {
  const out = [];
  for (const ch of config.youtube.channels.filter(c => c.channelId)) {
    const res = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + ch.channelId, { headers: { "User-Agent": config.userAgent } });
    if (!res.ok) { console.warn(`YouTube「${ch.name}」: HTTP ${res.status}`); continue; }
    const xml = await res.text();
    const entries = xml.split("<entry>").slice(1);
    for (const e of entries) {
      const vid = pick(e, /<yt:videoId>([^<]+)</);
      if (!vid) continue;
      out.push({
        src: "youtube", id: "yt:" + vid, url: "https://www.youtube.com/watch?v=" + vid,
        title: unxml(pick(e, /<title>([^<]*)</) || ""), tags: [],
        date: pick(e, /<published>([^<]+)</), views: Number(pick(e, /views="(\d+)"/)) || null, likes: null,
        thumb: pick(e, /<media:thumbnail url="([^"]+)"/) || null,
        uploader: unxml(pick(e, /<author>\s*<name>([^<]*)</) || ch.name), uploaderId: ch.channelId,
        channelGenre: ch.genre,
      });
    }
    console.log(`YouTube「${ch.name}」: ${entries.length}件`);
    await sleep(500);
  }
  return out;
}

// ---------- まとめて保存 ----------
const fixtureArg = process.argv.indexOf("--fixture");
const SEED = process.argv.includes("--seed");
const videos = fixtureArg > -1
  ? JSON.parse(await readFile(process.argv[fixtureArg + 1], "utf8"))
  : [...await fetchNiconico(SEED).catch(e => (console.warn("ニコニコ取得失敗:", e.message), [])),
     ...(SEED ? [] : await fetchYouTube()).catch(e => (console.warn("YouTube取得失敗:", e.message), []))];

const outFile = fixtureArg > -1 ? "data/songs.sample.json" : "data/songs.json";
const existing = new Map((await readJson(outFile, [])).map(i => [i.id, i]));
const overrides = await readJson("data/overrides.json", {});

for (const v of videos) {
  const fallback = v.channelGenre && v.channelGenre !== "歌ってみた" ? v.channelGenre : "その他";
  const item = classify(v, { fallbackGenre: fallback });
  if (v.seed) item.seed = true;
  if (v.channelGenre === "歌ってみた") { item.kind = "歌ってみた"; item.by ||= v.uploader; delete item.p; delete item.v; }
  const prev = existing.get(item.id);
  existing.set(item.id, prev ? { ...prev, ...item, seed: prev.seed || item.seed, firstSeen: prev.firstSeen } : { ...item, firstSeen: new Date().toISOString() });
}

// 管理人の手直し（data/overrides.json）を最後に上書き
let items = [...existing.values()];
for (const i of items) {
  const o = overrides[i.id];
  if (o) { Object.assign(i, o); if ("of" in o) i.ofLocked = true; }
}
items = linkCovers(items).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
// 人気曲（seed）は原曲の土台なので件数制限で消さない。それ以外は新しい順に残す
const seeds = items.filter(i => i.seed);
items = [...seeds, ...items.filter(i => !i.seed).slice(0, Math.max(0, config.maxItems - seeds.length))]
  .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

await mkdir(path("data/"), { recursive: true });
await writeFile(path(outFile), JSON.stringify(items, null, 1) + "\n");
const meta = {
  updatedAt: new Date().toISOString(),
  total: items.length,
  added: videos.length,
  byKind: Object.groupBy ? Object.fromEntries(Object.entries(Object.groupBy(items, i => i.kind)).map(([k, v]) => [k, v.length])) : undefined,
  linkedCovers: items.filter(i => i.of).length,
};
if (fixtureArg < 0) await writeFile(path("data/meta.json"), JSON.stringify(meta, null, 1) + "\n");
console.log(`保存しました: ${outFile}（全${items.length}件、うち歌ってみたの原曲ひもづけ ${meta.linkedCovers}件）`);
