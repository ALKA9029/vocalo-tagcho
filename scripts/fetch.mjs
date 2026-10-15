// 曲データを集めて data/songs.json を更新する。
//   node scripts/fetch.mjs                      … ニコニコとYouTubeから取得
//   node scripts/fetch.mjs --fixture FILE.json  … ネットにつながず、テスト用データで動かす
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { classify, linkCovers, toSite, isKaraoke, normalize } from "./classify.mjs";

// 実行の記録を data/last-run.txt にも残す（GitHubの画面を開かなくても、何件取れたか確認できるように）
const RUNLOG = [];
for (const k of ["log", "warn"]) { const orig = console[k]; console[k] = (...a) => { RUNLOG.push((k === "warn" ? "⚠ " : "") + a.join(" ")); orig(...a); }; }

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
        // updateOnly のクエリは、すでにある曲の再生数を更新するだけ（addWithinDays 日以内の投稿だけは新しく追加する）
        updateOnly: q.updateOnly && !(q.addWithinDays && Date.now() - new Date(r.startTime) < q.addWithinDays * 864e5) || undefined,
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
      part: "snippet,statistics,contentDetails,status", chart: "mostPopular", regionCode: t.regionCode || "JP",
      videoCategoryId: "10", maxResults: "50", key, ...(pageToken ? { pageToken } : {}),
    });
    const res = await ytFetch("https://www.googleapis.com/youtube/v3/videos?" + params);
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
const KOREAN_VOCALO = /보컬로이드|보카로|VOCALOID|UTAU|Synth(esizer)? ?V|CeVIO|하츠네|미쿠|카사네|테토|카가미네|메구리네|시유|SeeU|Hatsune|Miku|Kasane|Teto|Kagamine|初音ミク|重音テト|feat\.?\s*(GUMI|IA|flower|可不)(?![A-Za-z])/i;
function isJapanese(v) {
  const sn = v.snippet || {};
  // タイトルかチャンネル名にハングルがあって、タイトルにかながない動画は韓国の曲。
  // K-POPなどは外すが、韓国語のボカロ曲（歌声の名前やボカロの手がかりがあるもの）は残す
  if (/[\uac00-\ud7af]/.test(`${sn.title} ${sn.channelTitle}`) && !KANA.test(sn.title || "")) {
    return KOREAN_VOCALO.test([sn.title, (sn.description || "").slice(0, 600), ...(sn.tags || [])].join(" "));
  }
  if (/^ja/i.test(sn.defaultAudioLanguage || "") || /^ja/i.test(sn.defaultLanguage || "")) return true;
  if (KANA.test(`${sn.title} ${sn.channelTitle}`)) return true;
  // 説明文はしっかり日本語で書かれているときだけ（海外の曲のタグや字幕案内に少しだけカタカナがある、を除くため）
  return ((sn.description || "").slice(0, 600).match(/[\u3040-\u30ff]/g) || []).length >= 15;
}

// 曲ではなさそうな動画：絵文字だらけの告知動画、ショート動画（1分以下）、長い配信や企画動画（12分超）
const secs = d => { const m = (d || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; };
const isNoise = v => {
  if (((v.snippet?.title || "").match(/\p{Extended_Pictographic}/gu) || []).length >= 3) return true;
  const t = secs(v.contentDetails?.duration);
  return t != null && (t <= 61 || t > 12 * 60);
};

// YouTube APIを呼ぶ。短い時間に送りすぎて 429 が返ったら、少し待ってやり直す（最大3回）
async function ytFetch(url) {
  for (let i = 0; ; i++) {
    const res = await fetch(url);
    if (res.status !== 429 || i >= 3) return res;
    await sleep(5000 * (i + 1));
  }
}

// videos.list の1件をサイト用の形に（共通）
function ytItem(v, genre) {
  const sn = v.snippet || {}, st = v.statistics || {};
  return {
    src: "youtube", id: "yt:" + v.id, url: "https://www.youtube.com/watch?v=" + v.id,
    title: sn.title || "", tags: sn.tags || [], desc: sn.description || "", descHead: (sn.description || "").slice(0, 300),
    date: sn.publishedAt, views: st.viewCount != null ? Number(st.viewCount) : null, likes: st.likeCount != null ? Number(st.likeCount) : null,
    thumb: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || null,
    uploader: sn.channelTitle || "", uploaderId: sn.channelId || null,
    channelGenre: genre || "J-POP",
    // ページ内で再生できない（埋め込み禁止の）動画には印をつける。サイトではリンクで飛ぶだけにする
    ...(v.status?.embeddable === false ? { ne: 1 } : {}),
  };
}

// 動画IDから詳細（再生数・タグ・説明文）をまとめて取る。50件で1ユニットと安い
async function ytVideos(ids, key) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const params = new URLSearchParams({ part: "snippet,statistics,contentDetails,status", id: ids.slice(i, i + 50).join(","), key });
    const res = await ytFetch("https://www.googleapis.com/youtube/v3/videos?" + params);
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
  if (process.env.NO_SEARCH) { console.log("YouTube新着検索: 手動の実行なので飛ばします（検索回数の節約）"); return []; }
  const publishedAfter = new Date(Date.now() - (s.lookbackDays || 7) * 864e5).toISOString().replace(/\.\d+Z$/, "Z");
  const found = new Map();   // videoId -> ジャンルの手がかり
  for (const q of s.queries) {
    let pageToken = "";
    for (let page = 0; page < (q.maxPages || s.maxPages || 1); page++) {
      const params = new URLSearchParams({
        part: "id", type: "video", q: q.q, videoCategoryId: "10", regionCode: q.regionCode || s.regionCode || "JP",
        relevanceLanguage: q.relevanceLanguage || "ja", publishedAfter, order: "viewCount", maxResults: "50", key,
        ...(pageToken ? { pageToken } : {}),
      });
      await sleep(1000);
      const res = await ytFetch("https://www.googleapis.com/youtube/v3/search?" + params);
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
    .filter(v => v.views == null || v.views >= (s.minViewsByGenre?.[v.channelGenre] ?? s.minViews ?? 0))
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
    if (!isJapanese(v) || (isNoise(v) && !i.seed)) { drop.add(i.id); continue; }
    i.descHead = (v.snippet?.description || "").slice(0, 300);
    if (v.status?.embeddable === false) i.ne = 1; else delete i.ne;
    if (v.statistics?.viewCount != null) i.views = Number(v.statistics.viewCount);
    if (v.statistics?.likeCount != null) i.likes = Number(v.statistics.likeCount);
  }
  console.log(`YouTubeの再生数を更新: ${details.length}件（日本の曲ではないので外す: ${drop.size}件）`);
  return drop;
}

// ---------- 自動フォロー：サイトに載ったYouTubeチャンネルの新着を追いかける ----------
// data/channels.json に、一定以上再生された曲を出したチャンネルを自動で登録しておき、
// 毎日そのチャンネルのRSS（無料）で新着を確認。新着だけ詳細を取って（50件1ユニット）、音楽カテゴリの日本の曲を足す
async function fetchFollowed(knownIds) {
  const key = process.env.YOUTUBE_API_KEY;
  const f = config.youtube.follow;
  if (!key || !f?.enabled) { console.log("自動フォロー: APIキーがないので飛ばします"); return []; }
  const followed = await readJson("data/channels.json", []);
  const since = Date.now() - (f.lookbackDays || 7) * 864e5;
  const fresh = new Map();   // videoId -> チャンネル情報
  let checked = 0;
  for (let i = 0; i < followed.length; i += 8) {
    await Promise.all(followed.slice(i, i + 8).map(async ch => {
      try {
        const res = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + ch.id, { headers: { "User-Agent": config.userAgent } });
        if (!res.ok) return;
        checked++;
        for (const e of (await res.text()).split("<entry>").slice(1)) {
          const vid = pick(e, /<yt:videoId>([^<]+)</);
          const pub = Date.parse(pick(e, /<published>([^<]+)</) || "");
          if (vid && pub >= since && !knownIds.has("yt:" + vid)) fresh.set(vid, ch);
        }
      } catch {}
    }));
  }
  const details = (await ytVideos([...fresh.keys()], key))
    .filter(v => v.snippet?.categoryId === "10" && isJapanese(v) && !isNoise(v))
    .map(v => ytItem(v, fresh.get(v.id)?.genre))
    .filter(v => v.views == null || v.views >= (f.minViewsByGenre?.[v.channelGenre] ?? f.minViews ?? 0));
  console.log(`自動フォロー: ${followed.length}チャンネル中 ${checked}件を確認、新着 ${fresh.size}本のうち曲として追加 ${details.length}本`);
  return details;
}

// 一定以上再生された曲を出したチャンネルを自動フォローに登録する。
// ボカロの本家（作曲者）チャンネルと、それ以外（J-POP・アニソン・歌い手など）が同じくらいの割合になるように枠を分ける
async function updateFollowed(items) {
  const f = config.youtube.follow;
  if (!f?.enabled) return;
  const now = new Date().toISOString();
  const minFor = g => f.autoAddMinViewsByGenre?.[g] ?? f.autoAddMinViews ?? 10000;
  const old = new Map((await readJson("data/channels.json", [])).map(c => [c.id, c]));
  const list = new Map();
  // チャンネルごとに「ボカロの本家」と「歌ってみた」の数を数える（歌い手をボカロPと間違えないため）
  const tally = new Map();
  for (const i of items) if (i.src === "youtube" && i.uploaderId) {
    const t = tally.get(i.uploaderId) || { vocaloP: 0, cover: 0 };
    if (i.kind === "本家" && i.g === "ボカロ") t.vocaloP++; else if (i.kind === "歌ってみた") t.cover++;
    tally.set(i.uploaderId, t);
  }
  for (const i of items) {
    if (i.src !== "youtube" || !i.uploaderId) continue;
    const t = tally.get(i.uploaderId);
    const isVocaloP = t.vocaloP > 0 && t.vocaloP >= t.cover;
    if ((i.views || 0) < minFor(isVocaloP ? "ボカロ" : i.g)) continue;
    const prev = list.get(i.uploaderId) || old.get(i.uploaderId);
    const c = { ...(prev || { id: i.uploaderId, added: now }), name: i.uploader || prev?.name || "" };
    // ボカロの本家を1曲でも出していれば「ボカロ」枠
    c.genre = isVocaloP ? "ボカロ" : (i.g === "アニソン" ? "アニソン" : (c.genre && c.genre !== "ボカロ" ? c.genre : "J-POP"));
    if (!c.lastHit || (i.date || "") > c.lastHit) c.lastHit = i.date || now;
    if (i.seed) c.pinned = true;   // 昔からの人気曲を出しているチャンネルは外さない
    list.set(i.uploaderId, c);
  }
  const keep = c => c.pinned || (c.lastHit || c.added) >= new Date(Date.now() - (f.dropAfterDaysByGenre?.[c.genre] ?? f.dropAfterDays ?? 120) * 864e5).toISOString();
  const byRecent = (a, b) => (b.lastHit || "").localeCompare(a.lastHit || "");
  const all = [...list.values()].filter(keep).sort(byRecent);
  const max = f.maxChannels || 400;
  const vocaloMax = Math.round(max * (f.genreShare?.["ボカロ"] ?? 0.5));
  const floor = f.minPerSide ?? 100;
  const vAll = all.filter(c => c.genre === "ボカロ"), oAll = all.filter(c => c.genre !== "ボカロ");
  // 片方だけが増えすぎないように、もう片方の数（最低 floor）までにそろえる
  const vocalo = vAll.slice(0, Math.min(vocaloMax, Math.max(oAll.length, floor)));
  const others = oAll.slice(0, Math.min(max - vocaloMax, Math.max(vAll.length, floor)));
  const out = [...vocalo, ...others];
  await writeFile(path("data/channels.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`自動フォローのチャンネル: ${out.length}件（ボカロの本家 ${vocalo.length}件・その他 ${others.length}件）`);
}

// ---------- 一度だけ：YouTubeにいるボカロPのチャンネルを見つけるため、昔からの人気ボカロ曲を検索 ----------
async function fetchYouTubeSeedSearch() {
  const key = process.env.YOUTUBE_API_KEY;
  const s = config.youtube.seedSearch;
  if (!key || !s?.queries?.length) return [];
  const found = new Map();
  for (const q of s.queries) {
    let pageToken = "";
    for (let page = 0; page < (s.maxPages || 1); page++) {
      const params = new URLSearchParams({
        part: "id", type: "video", q: q.q || q, videoCategoryId: "10", regionCode: q.regionCode || "JP", relevanceLanguage: q.relevanceLanguage || "ja",
        order: "viewCount", maxResults: "50", key, ...(pageToken ? { pageToken } : {}),
      });
      await sleep(1000);
      const res = await ytFetch("https://www.googleapis.com/youtube/v3/search?" + params);
      if (!res.ok) { console.warn(`YouTube人気ボカロ検索「${q.q || q}」: HTTP ${res.status}`); break; }
      const body = await res.json();
      console.log(`YouTube人気曲検索「${q.q || q}」${page + 1}ページ目: ${(body.items || []).length}件`);
      for (const it of body.items || []) if (it.id?.videoId) found.set(it.id.videoId, q.genre || "ボカロ");
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
  }
  const all = await ytVideos([...found.keys()], key);
  const details = all.filter(v => isJapanese(v) && !isNoise(v));
  console.log(`YouTube人気曲検索: 見つかった${found.size}本／詳細${all.length}本／日本・韓国ボカロの曲${all.filter(isJapanese).length}本／長さOK${details.length}本`);
  const out = details.map(v => ({ ...ytItem(v, found.get(v.id)), seed: true }))
    .filter(v => (v.views || 0) >= (s.minViews || 0));
  console.log(`YouTube人気ボカロ検索: ${found.size}本のうち ${out.length}本を追加`);
  return out;
}

// ---------- 原曲さがし：原曲がサイトにない歌ってみたについて、ニコニコで同じ曲名のボカロ曲を探す ----------
// 一度調べた曲名は data/original-lookup.json に覚えておき、見つからなかった曲名は30日たったら調べ直す
async function lookupOriginals(items) {
  const cfg = config.niconico.originalLookup;
  if (!cfg?.enabled) return [];
  const cache = await readJson("data/original-lookup.json", {});
  const have = new Set(items.filter(i => i.kind === "本家").map(i => normalize(i.t)));
  const recheck = new Date(Date.now() - (cfg.recheckDays || 30) * 864e5).toISOString();
  const seen = new Set();
  const todo = items
    .filter(i => i.kind === "歌ってみた" && !i.of && i.t && normalize(i.t).length >= 2 && !have.has(normalize(i.t)))
    .sort((a, b) => (a.g === "その他" ? 0 : 1) - (b.g === "その他" ? 0 : 1) || (b.views || 0) - (a.views || 0))
    .filter(i => { const k = normalize(i.t); if (seen.has(k)) return false; seen.add(k); const c = cache[k]; return !c || (!c.id && c.checked < recheck); })
    .slice(0, cfg.maxPerRun || 300);
  const out = [];
  for (const c of todo) {
    const key = normalize(c.t);
    const params = new URLSearchParams({
      q: c.t, targets: "title",
      fields: "contentId,title,tags,startTime,viewCounter,likeCounter,thumbnailUrl,userId,channelId",
      "filters[tagsExact][0]": "VOCALOID", _sort: "-viewCounter", _limit: "10", _context: "vocalo-tagcho",
    });
    const started = Date.now();
    try {
      const res = await fetch("https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?" + params, { headers: { "User-Agent": config.userAgent } });
      if (!res.ok) { console.warn(`原曲さがし: HTTP ${res.status}、今日はここまで`); break; }
      const rows = (await res.json()).data || [];
      let hit = null;
      for (const r of rows) {
        const v = { src: "niconico", id: "nico:" + r.contentId, url: "https://www.nicovideo.jp/watch/" + r.contentId,
          title: unxml(r.title || ""), tags: (r.tags || "").split(" ").filter(Boolean).map(unxml),
          date: r.startTime, views: r.viewCounter, likes: r.likeCounter, thumb: r.thumbnailUrl, uploaderId: r.userId ?? r.channelId ?? null };
        const it = classify(v, { fallbackGenre: "ボカロ" });
        if (it.kind === "本家" && normalize(it.t) === key) { hit = { ...v, seed: true }; break; }
      }
      cache[key] = { id: hit?.id || null, checked: new Date().toISOString() };
      if (hit && !items.some(i => i.id === hit.id)) out.push(hit);
    } catch (e) { console.warn("原曲さがし:", e.message); break; }
    await sleep(Math.max(1000, Date.now() - started));
  }
  await writeFile(path("data/original-lookup.json"), JSON.stringify(cache) + "\n");
  console.log(`原曲さがし: ${todo.length}曲を調べて、原曲を${out.length}曲見つけた`);
  return out;
}

// ---------- 原曲さがし（YouTube）：原曲がサイトにないアニソン・J-POPの歌ってみたについて、公式の原曲MVを探す ----------
// 検索は1回100ユニットなので、1日 maxPerRun 曲まで（再生数の多い歌ってみたから順に）。
// 公式っぽいチャンネル（アーティスト名入り・Official・公式・- Topic・レーベル・アニメ公式）の、同じ曲名の本家だけを採用する
const OFFICIAL_CH = /official|公式|オフィシャル|vevo|- topic$|records|recordings|レコード|label|entertainment|animation|アニメ|anime|lantis|ランティス|aniplex|アニプレックス|flying ?dog|ポニーキャニオン|pony ?canyon|avex|sony music|king ?records|キングレコード|victor|ビクター|toy'?s ?factory|warner|ワーナー|universal|ユニバーサル|bandai|バンダイ|kadokawa|カドカワ|toho|東宝|columbia|コロムビア|tbs|フジテレビ|テレビ東京|nhk/i;
async function lookupOriginalsYouTube(items) {
  const cfg = config.youtube.originalLookup;
  const key = process.env.YOUTUBE_API_KEY;
  if (!cfg?.enabled || !key) return [];
  if (process.env.NO_SEARCH) { console.log("原曲さがし（YouTube）: 手動の実行なので飛ばします（検索回数の節約）"); return []; }
  const cache = await readJson("data/original-lookup.json", {});
  const genres = new Set(cfg.genres || ["アニソン", "J-POP"]);
  const have = new Set(items.filter(i => i.kind === "本家").map(i => normalize(i.t)));
  const recheck = new Date(Date.now() - (cfg.recheckDays || 60) * 864e5).toISOString();
  const seen = new Set();
  const todo = items
    .filter(i => i.kind === "歌ってみた" && !i.of && genres.has(i.g) && i.t && normalize(i.t).length >= 2 && !have.has(normalize(i.t)))
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .filter(i => { const k = "yt|" + normalize(i.t); if (seen.has(k)) return false; seen.add(k); const c = cache[k]; return !c || (!c.id && c.checked < recheck); })
    .slice(0, cfg.maxPerRun || 30);
  const out = [];
  let checked = 0;
  for (const c of todo) {
    const ck = "yt|" + normalize(c.t);
    // 「アーティスト名」の手がかり：歌ってみたのタイトルの「曲名 / アーティスト」「アーティスト - 曲名」から
    const artist = (c.p && normalize(c.p) !== normalize(c.t) && !/cover|歌ってみ/i.test(c.p) && !(c.by && normalize(c.by).includes(normalize(c.p)))) ? c.p.replace(/[（(].*$/, "").trim() : "";
    const params = new URLSearchParams({
      part: "id", type: "video", q: [c.t, artist].filter(Boolean).join(" "), regionCode: "JP", relevanceLanguage: "ja",
      videoCategoryId: "10", maxResults: "10", key,
    });
    await sleep(3000);
    const res = await ytFetch("https://www.googleapis.com/youtube/v3/search?" + params);
    if (!res.ok) { console.warn(`原曲さがし（YouTube）: HTTP ${res.status} ${(await res.text()).slice(0, 300).replace(/\s+/g, " ")}、今日はここまで`); break; }
    checked++;
    const ids = ((await res.json()).items || []).map(it => it.id?.videoId).filter(Boolean);
    const vids = (await ytVideos(ids, key)).filter(v => isJapanese(v) && !isNoise(v));
    let hit = null;
    for (const v of vids.sort((a, b) => Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0))) {
      const ch = v.snippet?.channelTitle || "";
      if (c.uploaderId && v.snippet?.channelId === c.uploaderId) continue;   // 歌ってみた本人のチャンネルは除く
      const official = OFFICIAL_CH.test(ch) || (artist && normalize(ch).includes(normalize(artist)));
      if (!official || Number(v.statistics?.viewCount || 0) < (cfg.minViews || 30000)) continue;
      const item = ytItem(v, c.g);
      if (isKaraoke(item.title)) continue;
      const it = classify(item, { fallbackGenre: c.g });
      if (it.kind === "本家" && normalize(it.t) === normalize(c.t)) { hit = { ...item, seed: true }; break; }
    }
    cache[ck] = { id: hit?.id || null, checked: new Date().toISOString() };
    if (hit && !items.some(i => i.id === hit.id) && !out.some(o => o.id === hit.id)) out.push(hit);
    console.log(`原曲さがし（YouTube）「${c.t}」→ ${hit ? `${hit.title}（${hit.uploader}）` : "見つからず"}`);
  }
  await writeFile(path("data/original-lookup.json"), JSON.stringify(cache) + "\n");
  console.log(`原曲さがし（YouTube）: ${checked}曲を調べて、原曲を${out.length}曲見つけた`);
  return out;
}

// ---------- 公式チャンネルの過去の人気曲：J-POP・アニソンの本家を出しているチャンネルの全動画から、よく再生された曲を本家として追加 ----------
// 検索は使わない（動画一覧は50本で1ユニット）。1回の取得で maxChannelsPerRun チャンネルずつ、recheckDays たったら見直す
const CATALOG_SKIP = /THE FIRST TAKE|\blive\b|ライブ|acoustic|アコースティック|弾き語り|remix|リミックス|instrumental|teaser|trailer|short ver|dance practice|ダンス(練習|プラクティス)|behind|making|メイキング|interview|インタビュー|コメント|告知|\bspot\b|\bcm\b|ダイジェスト|digest|#shorts/i;
async function fetchCatalogs(items) {
  const cfg = config.youtube.catalog;
  const key = process.env.YOUTUBE_API_KEY;
  if (!cfg?.enabled || !key) return [];
  const done = await readJson("data/catalog-done.json", {});
  const recheck = new Date(Date.now() - (cfg.recheckDays || 180) * 864e5).toISOString();
  const skipCh = new RegExp(cfg.skipChannels || "THE FIRST TAKE", "i");
  // チャンネルごとに、サイトにある本家と歌ってみたの数を数える
  const chs = new Map();
  for (const i of items) {
    if (i.src !== "youtube" || !i.uploaderId) continue;
    const c = chs.get(i.uploaderId) || { name: i.uploader || "", orig: 0, cov: 0, jp: 0, anime: 0, max: 0 };
    if (i.kind === "本家" && !i.reprint) { c.orig++; if (i.g === "J-POP") c.jp++; if (i.g === "アニソン") c.anime++; c.max = Math.max(c.max, i.views || 0); } else c.cov++;
    chs.set(i.uploaderId, c);
  }
  const todo = [...chs].filter(([id, c]) => c.orig >= c.cov && c.jp + c.anime >= 1 && c.max >= (cfg.channelMinViews || 100000) && !skipCh.test(c.name) && !(done[id] > recheck))
    .sort((a, b) => b[1].max - a[1].max).slice(0, cfg.maxChannelsPerRun || 50);
  const known = new Set(items.map(i => i.id));
  const haveT = new Set(items.filter(i => i.kind === "本家").map(i => normalize(i.t) + "|" + normalize(i.p || "")));
  const otherT = new Map();
  for (const i of items) if (i.kind === "本家" && normalize(i.t)) (otherT.get(normalize(i.t)) || otherT.set(normalize(i.t), new Set()).get(normalize(i.t))).add(normalize(i.p || ""));
  const sameP = it => otherT.get(normalize(it.t))?.has(normalize(it.p || ""));
  const out = [];
  for (const [id, c] of todo) {
    const ids = [];
    let pageToken = "";
    for (let page = 0; page < (cfg.maxPages || 6); page++) {
      const params = new URLSearchParams({ part: "contentDetails", playlistId: "UU" + id.slice(2), maxResults: "50", key, ...(pageToken ? { pageToken } : {}) });
      const res = await ytFetch("https://www.googleapis.com/youtube/v3/playlistItems?" + params);
      if (!res.ok) break;
      const body = await res.json();
      for (const it of body.items || []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    const genre = c.anime > c.jp ? "アニソン" : "J-POP";
    const seenT = new Set();
    const got = (await ytVideos(ids.filter(v => !known.has("yt:" + v)), key))
      .filter(v => v.snippet?.categoryId === "10" && isJapanese(v) && !isNoise(v) && !CATALOG_SKIP.test(v.snippet?.title || ""))
      .filter(v => Number(v.statistics?.viewCount || 0) >= (cfg.minViews || 300000))
      .map(v => ({ ...ytItem(v, genre), seed: true }))
      .map(v => ({ v, it: classify(v, { fallbackGenre: genre }) }))
      // ほかの人の曲としてすでにある曲名は、歌い手のチャンネルのカバーかもしれないので入れない
      .filter(({ v, it }) => !isKaraoke(v.title) && it.kind === "本家" && normalize(it.t) && !haveT.has(normalize(it.t) + "|" + normalize(it.p || "")) && !(otherT.has(normalize(it.t)) && !sameP(it)))
      .sort((a, b) => (b.v.views || 0) - (a.v.views || 0))
      // 同じ曲の別の動画（Official Audio・Lyric Video・ダンス版など）は1本だけ
      .filter(({ it }) => { const k = normalize(it.t); if (seenT.has(k)) return false; seenT.add(k); return true; })
      .map(({ v }) => v).slice(0, cfg.topPerChannel || 10);
    out.push(...got);
    done[id] = new Date().toISOString();
    console.log(`公式チャンネルの人気曲「${c.name}」: ${ids.length}本のうち ${got.length}曲を追加${got.length ? `（${got.slice(0, 3).map(v => v.title.slice(0, 30)).join("／")}…）` : ""}`);
  }
  await writeFile(path("data/catalog-done.json"), JSON.stringify(done) + "\n");
  console.log(`公式チャンネルの人気曲: ${todo.length}チャンネルを見て、${out.length}曲を追加`);
  return out;
}

// ---------- まとめて保存 ----------
const fixtureArg = process.argv.indexOf("--fixture");
const SEED = process.argv.includes("--seed");
const videos = fixtureArg > -1
  ? JSON.parse(await readFile(process.argv[fixtureArg + 1], "utf8"))
  : [...await fetchNiconico(SEED).catch(e => (console.warn("ニコニコ取得失敗:", e.message), [])),
     ...(SEED ? [] : await fetchYouTube().catch(e => (console.warn("YouTube取得失敗:", e.message), []))),
     ...(SEED ? [] : await fetchYouTubeTrending().catch(e => (console.warn("YouTube急上昇の取得失敗:", e.message), []))),
     ...(SEED ? [] : await fetchYouTubeSearch().catch(e => (console.warn("YouTube新着検索の取得失敗:", e.message), []))),
     ...(SEED ? await fetchYouTubeSeedSearch().catch(e => (console.warn("YouTube人気ボカロ検索の取得失敗:", e.message), [])) : []),
     ...(SEED ? [] : await fetchFollowed(new Set((await readJson("data/songs.json", [])).map(i => i.id))).catch(e => (console.warn("自動フォローの取得失敗:", e.message), []))),
     ...(SEED ? [] : await fetchCatalogs(await readJson("data/songs.json", [])).catch(e => (console.warn("公式チャンネルの人気曲の取得失敗:", e.message), [])))];

const outFile = fixtureArg > -1 ? "data/songs.sample.json" : "data/songs.json";
const existing = new Map((await readJson(outFile, [])).map(i => [i.id, i]));
const overrides = await readJson("data/overrides.json", {});

let statsOnly = 0;
for (const v of videos) {
  if (isKaraoke(v.title)) continue;
  if (v.updateOnly) {
    const prev = existing.get(v.id);
    if (prev) { prev.views = v.views ?? prev.views; prev.likes = v.likes ?? prev.likes; statsOnly++; }
    continue;
  }
  const fallback = v.channelGenre && v.channelGenre !== "歌ってみた" ? v.channelGenre : "その他";
  const item = classify(v, { fallbackGenre: fallback });
  if (v.seed) item.seed = true;
  if (v.channelGenre === "歌ってみた") { item.kind = "歌ってみた"; item.chCover = true; item.by ||= v.uploader; delete item.p; delete item.v; }
  const prev = existing.get(item.id);
  existing.set(item.id, prev ? { ...prev, ...item, seed: prev.seed || item.seed, firstSeen: prev.firstSeen } : { ...item, firstSeen: new Date().toISOString() });
}

if (statsOnly) console.log(`ニコニコの再生数を更新: ${statsOnly}件`);

// 管理人の手直し（data/overrides.json）を最後に上書き
let items = [...existing.values()];
if (fixtureArg < 0 && !SEED) {
  // 原曲がサイトにない歌ってみたの原曲を探して、見つかった本家を追加する
  const found = await lookupOriginals(items).catch(e => (console.warn("原曲さがしに失敗:", e.message), []));
  for (const v of found) items.push({ ...classify(v, { fallbackGenre: "ボカロ" }), seed: true, firstSeen: new Date().toISOString() });
  // アニソン・J-POPの原曲は YouTube の公式MVから探す
  const foundYT = await lookupOriginalsYouTube(items).catch(e => (console.warn("原曲さがし（YouTube）に失敗:", e.message), []));
  for (const v of foundYT) items.push({ ...classify(v, { fallbackGenre: v.channelGenre }), seed: true, firstSeen: new Date().toISOString() });
}
if (fixtureArg < 0 && !SEED) {
  // 今回の取得で更新されなかった最近のYouTube曲だけ、再生数を取り直す
  const fresh = new Set(videos.map(v => v.id));
  const drop = await refreshYouTubeStats(items.filter(i => !fresh.has(i.id))).catch(e => (console.warn("再生数の更新に失敗:", e.message), new Set()));
  items = items.filter(i => !drop.has(i.id));
}
for (const i of items) {
  const o = overrides[i.id];
  if (o) { Object.assign(i, o); if ("of" in o) i.ofLocked = true; if ("g" in o) i.gFixed = o.g; }
}
// 投稿日時はニコニコが日本時間、YouTubeが世界標準時で書かれているので、時刻に直して比べる
const byNewest = (a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
items = linkCovers(items).sort(byNewest);
// 人気曲（seed）は原曲の土台なので件数制限で消さない。それ以外は新しい順に残す
const seeds = items.filter(i => i.seed);
items = [...seeds, ...items.filter(i => !i.seed).slice(0, Math.max(0, config.maxItems - seeds.length))]
  .sort(byNewest);

await mkdir(path("data/"), { recursive: true });
if (fixtureArg < 0) await updateFollowed(items).catch(e => console.warn("自動フォローの更新に失敗:", e.message));
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
if (fixtureArg < 0) await writeFile(path("data/last-run.txt"), `${new Date().toISOString()}${SEED ? "（seed）" : ""}\n` + RUNLOG.join("\n") + "\n");
