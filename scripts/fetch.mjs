// 曲データを集めて data/songs.json を更新する。
//   node scripts/fetch.mjs                      … ニコニコとYouTubeから取得
//   node scripts/fetch.mjs --fixture FILE.json  … ネットにつながず、テスト用データで動かす
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { classify, linkCovers, toSite } from "./classify.mjs";

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
  const sinceFor = days => new Date(Date.now() - days * 864e5).toISOString().replace(/\.\d+Z$/, "+00:00");
  const out = [];
  for (const q of seed ? nc.seedQueries : nc.queries) {
    const since = sinceFor(q.lookbackDays ?? nc.lookbackDays);
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
        title: unxml(r.title || ""), tags: (r.tags || "").split(" ").filter(Boolean).map(unxml),
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

// ---------- YouTube 音楽の急上昇（日本）。APIキー（環境変数 YOUTUBE_API_KEY）が必要 ----------
async function fetchYouTubeTrending() {
  const key = process.env.YOUTUBE_API_KEY;
  const t = config.youtube.trending;
  if (!key || !t?.enabled) { console.log("YouTube急上昇: APIキーがないので飛ばします"); return []; }
  const out = [];
  let pageToken = "";
  for (let page = 0; page < (t.maxPages || 1); page++) {
    const params = new URLSearchParams({
      part: "snippet,statistics", chart: "mostPopular", regionCode: t.regionCode || "JP",
      videoCategoryId: "10", maxResults: "50", key, ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + params);
    if (!res.ok) { console.warn(`YouTube急上昇: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); break; }
    const body = await res.json();
    for (const v of (body.items || []).filter(v => isJapanese(v) && !isNoise(v))) {
      const item = ytItem(v, t.defaultGenre);
      if (item.views != null && item.views < (t.minViews || 0)) continue;
      out.push(item);
    }
    console.log(`YouTube急上昇 ${page + 1}ページ目: ${(body.items || []).length}件`);
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

// 日本の曲か：音声言語が日本語、またはタイトル・チャンネル名・説明文・タグにかなが入っている
const KANA = /[\u3040-\u30ff]/;
function isJapanese(v) {
  const sn = v.snippet || {};
  if (/^ja/i.test(sn.defaultAudioLanguage || "") || /^ja/i.test(sn.defaultLanguage || "")) return true;
  return KANA.test([sn.title, sn.channelTitle, (sn.description || "").slice(0, 500), ...(sn.tags || [])].join(" "));
}

// 曲ではなさそうな動画（絵文字だらけの告知動画など）
const isNoise = v => ((v.snippet?.title || "").match(/\p{Extended_Pictographic}/gu) || []).length >= 3;

// videos.list の1件をサイト用の形に（共通）
function ytItem(v, genre) {
  const sn = v.snippet || {}, st = v.statistics || {};
  return {
    src: "youtube", id: "yt:" + v.id, url: "https://www.youtube.com/watch?v=" + v.id,
    title: sn.title || "", tags: sn.tags || [], desc: sn.description || "",
    date: sn.publishedAt, views: st.viewCount != null ? Number(st.viewCount) : null, likes: st.likeCount != null ? Number(st.likeCount) : null,
    thumb: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || null,
    uploader: sn.channelTitle || "", uploaderId: sn.channelId || null,
    channelGenre: genre || "J-POP",
  };
}

// 動画IDから詳細（再生数・タグ・説明文）をまとめて取る。50件で1ユニットと安い
async function ytVideos(ids, key) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const params = new URLSearchParams({ part: "snippet,statistics", id: ids.slice(i, i + 50).join(","), key });
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + params);
    if (!res.ok) { console.warn(`YouTube詳細: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); break; }
    out.push(...((await res.json()).items || []));
  }
  return out;
}

// ---------- YouTube 新着検索：直近N日に投稿された音楽動画を、キーワードごとに再生数の多い順で ----------
// 検索は1回100ユニット（1日の無料枠は10,000）なので、キーワード数×ページ数に注意
async function fetchYouTubeSearch() {
  const key = process.env.YOUTUBE_API_KEY;
  const s = config.youtube.search;
  if (!key || !s?.enabled) { console.log("YouTube新着検索: APIキーがないので飛ばします"); return []; }
  const publishedAfter = new Date(Date.now() - (s.lookbackDays || 7) * 864e5).toISOString().replace(/\.\d+Z$/, "Z");
  const found = new Map();   // videoId -> ジャンルの手がかり
  for (const q of s.queries) {
    let pageToken = "";
    for (let page = 0; page < (q.maxPages || s.maxPages || 1); page++) {
      const params = new URLSearchParams({
        part: "id", type: "video", q: q.q, videoCategoryId: "10", regionCode: s.regionCode || "JP",
        relevanceLanguage: "ja", publishedAfter, order: "viewCount", maxResults: "50", key,
        ...(pageToken ? { pageToken } : {}),
      });
      const res = await fetch("https://www.googleapis.com/youtube/v3/search?" + params);
      if (!res.ok) { console.warn(`YouTube新着検索「${q.label}」: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); break; }
      const body = await res.json();
      for (const it of body.items || []) if (it.id?.videoId && !found.has(it.id.videoId)) found.set(it.id.videoId, q.genre);
      console.log(`YouTube新着検索「${q.label}」${page + 1}ページ目: ${(body.items || []).length}件`);
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
  }
  const details = (await ytVideos([...found.keys()], key)).filter(v => isJapanese(v) && !isNoise(v));
  return details.map(v => ytItem(v, found.get(v.id)))
    .filter(v => v.views == null || v.views >= (s.minViews || 0))
    .filter(v => !/#shorts/i.test(v.title));
}

// ---------- 保存済みのYouTube曲の再生数を更新（50件で1ユニットなので全件でも安い） ----------
// あわせて、日本の曲ではないものを外す（戻り値：外す曲のIDの集合）
async function refreshYouTubeStats(items) {
  const key = process.env.YOUTUBE_API_KEY;
  const drop = new Set();
  if (!key) return drop;
  const byId = new Map(items.filter(i => i.src === "youtube").map(i => [i.id.slice(3), i]));
  const details = await ytVideos([...byId.keys()], key);
  for (const v of details) {
    const i = byId.get(v.id);
    if ((!isJapanese(v) || isNoise(v)) && !i.seed) { drop.add(i.id); continue; }
    if (v.statistics?.viewCount != null) i.views = Number(v.statistics.viewCount);
    if (v.statistics?.likeCount != null) i.likes = Number(v.statistics.likeCount);
  }
  console.log(`YouTubeの再生数を更新: ${details.length}件（日本の曲ではないので外す: ${drop.size}件）`);
  return drop;
}

// ---------- まとめて保存 ----------
const fixtureArg = process.argv.indexOf("--fixture");
const SEED = process.argv.includes("--seed");
const videos = fixtureArg > -1
  ? JSON.parse(await readFile(process.argv[fixtureArg + 1], "utf8"))
  : [...await fetchNiconico(SEED).catch(e => (console.warn("ニコニコ取得失敗:", e.message), [])),
     ...(SEED ? [] : await fetchYouTube().catch(e => (console.warn("YouTube取得失敗:", e.message), []))),
     ...(SEED ? [] : await fetchYouTubeTrending().catch(e => (console.warn("YouTube急上昇の取得失敗:", e.message), []))),
     ...(SEED ? [] : await fetchYouTubeSearch().catch(e => (console.warn("YouTube新着検索の取得失敗:", e.message), [])))];

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
if (fixtureArg < 0 && !SEED) {
  // 今回の取得で更新されなかった最近のYouTube曲だけ、再生数を取り直す
  const fresh = new Set(videos.map(v => v.id));
  const drop = await refreshYouTubeStats(items.filter(i => !fresh.has(i.id))).catch(e => (console.warn("再生数の更新に失敗:", e.message), new Set()));
  items = items.filter(i => !drop.has(i.id));
}
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

// サイト表示用：必要な項目だけにした軽いデータ
if (fixtureArg < 0) await writeFile(path("data/site.json"), JSON.stringify(toSite(items)) + "\n");
console.log(`保存しました: ${outFile}（全${items.length}件、うち歌ってみたの原曲ひもづけ ${meta.linkedCovers}件）`);
