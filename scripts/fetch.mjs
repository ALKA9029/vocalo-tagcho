// 曲データを集めて data/songs.json を更新する。
//   node scripts/fetch.mjs                      … ニコニコとYouTubeから取得
//   node scripts/fetch.mjs --fixture FILE.json  … ネットにつながず、テスト用データで動かす
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { classify, linkCovers, toSite, isKaraoke, normalize, animeInDesc, singerCore, fixReqSinger } from "./classify.mjs";

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

// タイトル：日本語版があればそちら。ただし韓国語の曲（元のタイトルにハングルがある）は原題のまま
const pickTitle = sn => /[\uac00-\ud7a3]/.test(sn.title || "") ? (sn.title || "") : (sn.localized?.title || sn.title || "");

// videos.list の1件をサイト用の形に（共通）
function ytItem(v, genre) {
  const sn = v.snippet || {}, st = v.statistics || {};
  return {
    src: "youtube", id: "yt:" + v.id, url: "https://www.youtube.com/watch?v=" + v.id,
    title: pickTitle(sn), tags: sn.tags || [], desc: sn.description || "", descHead: (sn.description || "").slice(0, 300),
    date: sn.publishedAt, views: st.viewCount != null ? Number(st.viewCount) : null, likes: st.likeCount != null ? Number(st.likeCount) : null,
    thumb: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || null,
    uploader: sn.channelTitle || "", uploaderId: sn.channelId || null,
    channelGenre: genre || "J-POP",
    // ページ内で再生できない（埋め込み禁止の）動画には印をつける。サイトではリンクで飛ぶだけにする
    // 「〇〇 - Topic」チャンネルの自動生成の音源は、埋め込みでは再生できないことが多いので、動画サイトを開くだけにする
    ...(v.status?.embeddable === false || / - Topic$/.test(sn.channelTitle || "") ? { ne: 1 } : {}),
    ...(animeInDesc(sn.description || "") ? { animeDesc: 1 } : {}),
  };
}

// 動画IDから詳細（再生数・タグ・説明文）をまとめて取る。50件で1ユニットと安い
async function ytVideos(ids, key) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    // hl=ja：日本語のタイトルが登録されていれば snippet.localized にそれが入る（Topic の「KUSUSHIKI」→「クスシキ」など）
    const params = new URLSearchParams({ part: "snippet,statistics,contentDetails,status", id: ids.slice(i, i + 50).join(","), hl: "ja", key });
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
    // 日本語のタイトルがあればそちらに（もともと英語の曲名は、日本語版がないのでそのまま）
    const lt = pickTitle(v.snippet || {});
    if (lt && lt !== i.title) { console.log(`タイトルを更新: ${i.title} → ${lt}`); i.title = lt; }
    if (animeInDesc(v.snippet?.description || "")) i.animeDesc = 1; else delete i.animeDesc;
    if (v.status?.embeddable === false || / - Topic$/.test(v.snippet?.channelTitle || "")) i.ne = 1; else delete i.ne;
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
  // 全部取り込むチャンネル（config の catalog.full：チャンネル名と、取り込む動画タイトルの形）。一度ずつ、決めた形のタイトルの動画を数の制限なしで
  const full = (cfg.full || []).map(f => ({ ch: new RegExp(f.channel || "^$", "i"), title: new RegExp(f.title, "i"), handle: f.handle, key: "full:" + (f.channel || "@" + f.handle) + "|" + f.title }));
  // サイトにまだ動画がないチャンネルは、@ハンドルからチャンネルを調べて加える（channels.list は1ユニット）
  for (const f of full.filter(f => f.handle)) {
    let id = done["handle:" + f.handle];
    if (!id) {
      const res = await ytFetch("https://www.googleapis.com/youtube/v3/channels?" + new URLSearchParams({ part: "id", forHandle: f.handle, key }));
      id = res.ok ? (await res.json()).items?.[0]?.id : null;
      if (id) done["handle:" + f.handle] = id; else { console.warn(`公式チャンネル @${f.handle} が見つからない`); continue; }
    }
    if (!chs.has(id)) chs.set(id, { name: "@" + f.handle, orig: 0, cov: 0, jp: 1, anime: 0, max: 0 });
    chs.get(id).full = f;
  }
  const fullOf = c => c.full || full.find(f => f.ch.test(c.name));
  const todo = [...chs].filter(([id, c]) => { const f = fullOf(c); return f ? !done[f.key + "|" + id] : (c.orig >= c.cov && c.jp + c.anime >= 1 && c.max >= (cfg.channelMinViews || 100000) && !skipCh.test(c.name) && !(done[id] > recheck)); })
    .sort((a, b) => (fullOf(b[1]) ? 1 : 0) - (fullOf(a[1]) ? 1 : 0) || b[1].max - a[1].max).slice(0, cfg.maxChannelsPerRun || 50);
  const known = new Set(items.map(i => i.id));
  const notTopic = i => !/ - Topic$/.test(i.uploader || "");   // Topicの自動生成音源は、公式の動画で置きかえたいので「もうある曲」に数えない
  const haveT = new Set(items.filter(i => i.kind === "本家" && notTopic(i)).map(i => normalize(i.t) + "|" + normalize(i.p || "")));
  const otherT = new Map();
  for (const i of items) if (i.kind === "本家" && notTopic(i) && normalize(i.t)) (otherT.get(normalize(i.t)) || otherT.set(normalize(i.t), new Set()).get(normalize(i.t))).add(normalize(i.p || ""));
  const sameP = it => otherT.get(normalize(it.t))?.has(normalize(it.p || ""));
  const out = [];
  for (const [id, c] of todo) {
    const ids = [];
    let pageToken = "";
    const f = fullOf(c);
    for (let page = 0; page < (f ? 20 : (cfg.maxPages || 6)); page++) {
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
      .filter(v => f ? f.title.test((v.snippet?.localized?.title || v.snippet?.title || "").normalize("NFC").replace(/\s+/g, " ")) : Number(v.statistics?.viewCount || 0) >= (cfg.minViews || 300000))
      .map(v => ({ ...ytItem(v, genre), seed: true }))
      .map(v => ({ v, it: classify(v, { fallbackGenre: genre }) }))
      // ほかの人の曲としてすでにある曲名は、歌い手のチャンネルのカバーかもしれないので入れない
      .filter(({ v, it }) => !isKaraoke(v.title) && it.kind === "本家" && normalize(it.t) && !haveT.has(normalize(it.t) + "|" + normalize(it.p || "")) && !(otherT.has(normalize(it.t)) && !sameP(it)))
      .sort((a, b) => (b.v.views || 0) - (a.v.views || 0))
      // 同じ曲の別の動画（Official Audio・Lyric Video・ダンス版など）は1本だけ
      .filter(({ it }) => { const k = normalize(it.t); if (seenT.has(k)) return false; seenT.add(k); return true; })
      .map(({ v }) => v).slice(0, f ? 1000 : (cfg.topPerChannel || 10));
    out.push(...got);
    done[f ? f.key + "|" + id : id] = new Date().toISOString();
    console.log(`公式チャンネルの人気曲「${c.name}」: ${ids.length}本のうち ${got.length}曲を追加${got.length ? `（${got.slice(0, 3).map(v => v.title.slice(0, 30)).join("／")}…）` : ""}`);
  }
  await writeFile(path("data/catalog-done.json"), JSON.stringify(done) + "\n");
  console.log(`公式チャンネルの人気曲: ${todo.length}チャンネルを見て、${out.length}曲を追加`);
  return out;
}

// ---------- 歌ってみたのリクエスト：曲ページから送られたURLを確認して、その曲の歌ってみたとして追加 ----------
// Supabase の get_cover_requests() で読む。動画のタイトルに曲名が入っているものだけを載せる。確認した結果は data/requests-done.json に
const SUPABASE_URL = "https://qfepllrtalfvyhsezjwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_DIFM6mVEbJaB0OYSkY74Hw_1oF_6eaU";   // 公開用の鍵
function videoIdOf(url) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return "yt:" + yt[1];
  const nico = url.match(/(?:nicovideo\.jp\/watch\/|nico\.ms\/)((?:sm|nm|so)\d+)/);
  return nico ? "nico:" + nico[1] : null;
}
// ニコニコの動画1本の情報（getthumbinfo。XML）
async function nicoThumb(cid) {
  const res = await fetch("https://ext.nicovideo.jp/api/getthumbinfo/" + cid, { headers: { "User-Agent": config.userAgent } });
  if (!res.ok) return null;
  const x = await res.text();
  if (!/status="ok"/.test(x)) return null;
  const g = tag => unxml((x.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "");
  return {
    src: "niconico", id: "nico:" + cid, url: "https://www.nicovideo.jp/watch/" + cid,
    title: g("title"), tags: [...x.matchAll(/<tag[^>]*>([^<]+)<\/tag>/g)].map(m => unxml(m[1])),
    date: g("first_retrieve"), views: Number(g("view_counter")) || 0, likes: null,
    thumb: g("thumbnail_url") || null, uploaderId: g("user_id") || g("ch_id") || null, uploader: g("user_nickname") || g("ch_name") || "",
  };
}
async function fetchRequests(items) {
  const cfg = config.requests || {};
  if (cfg.enabled === false) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_cover_requests`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: "{}" });
  if (!res.ok) { console.log(`歌ってみたのリクエスト: 読めませんでした（HTTP ${res.status}）`); return []; }
  const rows = await res.json();
  const done = await readJson("data/requests-done.json", {});
  const byId = new Map(items.map(i => [i.id, i]));
  const key = process.env.YOUTUBE_API_KEY;
  const out = [];
  const todo = rows.filter(r => !done[r.song_id + " " + r.url]).slice(0, cfg.maxPerRun || 100);
  for (const r of todo) {
    const k = r.song_id + " " + r.url;
    const song = byId.get(r.song_id);
    const vid = videoIdOf(r.url);
    const result = reason => { done[k] = { r: reason, at: new Date().toISOString() }; console.log(`歌ってみたのリクエスト「${song?.t || r.song_id}」${r.url} → ${reason}`); };
    if (!song || song.kind !== "本家") { result("曲が見つからない"); continue; }
    if (!vid) { result("URLが読めない"); continue; }
    if (byId.has(vid)) {
      const have = byId.get(vid);
      if (have.kind === "歌ってみた" && !have.of && normalize(have.title).includes(normalize(song.t))) { out.push({ id: vid, linkOnly: true, req: song.id }); result("サイトにある歌ってみたを原曲につないだ"); }
      else result("もうサイトにある");
      continue;
    }
    let v = null;
    if (vid.startsWith("yt:")) {
      if (!key) { continue; }
      const d = (await ytVideos([vid.slice(3)], key))[0];
      if (d && !isNoise(d)) v = ytItem(d, song.g);
    } else {
      v = await nicoThumb(vid.slice(5)).catch(() => null);
      await sleep(1000);
    }
    if (!v) { result("動画が見つからない・長さが合わない"); continue; }
    // タイトルに曲名（記号・空白を除いて）が入っているものだけ
    if (!normalize(v.title).includes(normalize(song.t))) { result("タイトルに曲名がない"); continue; }
    if (isKaraoke(v.title)) { result("曲の動画ではない"); continue; }
    out.push({ ...v, req: song.id });
    result("追加した");
  }
  await writeFile(path("data/requests-done.json"), JSON.stringify(done) + "\n");
  if (rows.length) console.log(`歌ってみたのリクエスト: 全${rows.length}件、今回確認${todo.length}件、追加${out.length}件`);
  return out;
}

// ---------- 手で追加する動画（data/add.json）：自動では見つからない・選ばれない公式動画を本家として入れる ----------
async function fetchManual(knownIds) {
  const key = process.env.YOUTUBE_API_KEY;
  const list = await readJson("data/add.json", []);
  // { "q": "検索ことば", "channel": "チャンネル名（正規表現）", "t": "曲名", "p": "作者" } の形は、YouTubeを1回だけ検索してIDに置きかえる
  // （1回100ユニット）。t・p があれば overrides.json に書いておく（ニコニコ版と同じ曲としてまとまるように）
  const qs = list.filter(x => x.q && !x.id);
  if (key && qs.length) {
    const overrides = await readJson("data/overrides.json", {});
    for (const x of qs) {
      const res = await ytFetch("https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({ part: "snippet", type: "video", q: x.q, maxResults: "15", regionCode: "JP", key }));
      if (!res.ok) { console.warn(`手で追加する動画「${x.q}」: 検索できなかった（HTTP ${res.status}）`); continue; }
      const ch = new RegExp(x.channel || ".", "i");
      // 条件に合う動画のうち、ショート・短すぎ/長すぎを除いて、いちばん再生されているもの
      const cands = ((await res.json()).items || []).filter(it => it.id?.videoId && ch.test(it.snippet?.channelTitle || "") && !/ - Topic$/.test(it.snippet?.channelTitle || "") && !/#shorts?/i.test(it.snippet?.title || "") && (!x.t || normalize(unxml(it.snippet?.title || "")).includes(normalize(x.t))));
      const det = (await ytVideos(cands.map(it => it.id.videoId), key)).filter(v => !isNoise(v)).sort((a, b) => Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0));
      const hit = det[0] && cands.find(it => it.id.videoId === det[0].id);
      if (!hit) { console.log(`手で追加する動画「${x.q}」: 見つからなかった`); x.miss = new Date().toISOString().slice(0, 10); continue; }
      x.id = "yt:" + hit.id.videoId;
      x.note = `${x.note || x.q}（自動で見つけた：${unxml(hit.snippet.title)} / ${hit.snippet.channelTitle}）`;
      if (x.t || x.p) overrides[x.id] = { ...(overrides[x.id] || {}), ...(x.t ? { t: x.t } : {}), ...(x.p ? { p: x.p } : {}) };
      console.log(`手で追加する動画「${x.q}」→ ${x.id} ${unxml(hit.snippet.title)}（${hit.snippet.channelTitle}）`);
    }
    await writeFile(path("data/add.json"), JSON.stringify(list, null, 1) + "\n");
    await writeFile(path("data/overrides.json"), JSON.stringify(overrides) + "\n");
  }
  const yt = list.map(x => x.id).filter(id => id?.startsWith("yt:") && !knownIds.has(id)).map(id => id.slice(3));
  // まとめて追加する動画（data/add-bulk.json：IDの一覧）：一度だけ取りにいって、音楽の動画（音楽カテゴリか、タイトルに歌ってみた・cover・MVなど）だけ入れる。
  // 取りにいったら一覧は空にする
  const bulk = (await readJson("data/add-bulk.json", [])).filter(id => id?.startsWith("yt:") && !knownIds.has(id)).map(id => id.slice(3));
  if (!key || (!yt.length && !bulk.length)) return [];
  const got = (await ytVideos(yt, key)).map(v => ({ ...ytItem(v, "J-POP"), seed: true }));
  console.log(`手で追加する動画: ${got.length}本`);
  if (bulk.length) {
    const MUSICISH = /歌ってみた|歌わせて|cover|カバー|\bMV\b|Music Video|feat\.|ft\.|オリジナル曲|Official (Audio|Video)|Lyric/i;
    const vs = (await ytVideos(bulk, key)).filter(v => !isNoise(v) && (v.snippet?.categoryId === "10" || MUSICISH.test(v.snippet?.title || "")));
    got.push(...vs.map(v => ({ ...ytItem(v, "J-POP"), seed: true })));
    console.log(`まとめて追加する動画: ${bulk.length}本のうち音楽の動画 ${vs.length}本`);
    await writeFile(path("data/add-bulk.json"), "[]\n");
  }
  return got;
}

// ---------- 今日の投稿ネタの曲の歌ってみた：data/picks.json の今日の曲（前の日に決めてある）について、 ----------
// ニコニコとYouTubeで「曲名 歌ってみた」を探して、よく聴かれているものを数件ずつその曲の歌ってみたとして追加する。調べた曲は data/pick-covers-done.json に
const COVER_WORD = /歌ってみた|歌わせていただきました|\bcover\b|カバー/i;
async function fetchPickCovers(items) {
  const cfg = config.pickCovers || {};
  if (cfg.enabled === false) return [];
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const picks = (await readJson("data/picks.json", {}))[today] || [];
  // 手で頼んだ曲（data/cover-wanted.json：曲のIDの一覧）も同じように探す。こちらは手動の実行でもYouTubeを検索する（1曲1回）
  const wanted = await readJson("data/cover-wanted.json", []);
  if (!picks.length && !wanted.length) { console.log("投稿ネタの歌ってみた: 今日のネタがまだ決まっていないので飛ばします"); return []; }
  const done = await readJson("data/pick-covers-done.json", {});
  const byId = new Map(items.map(i => [i.id, i]));
  const known = new Set(items.map(i => i.id));
  const perSong = cfg.perSong || 4, minViews = cfg.minViews ?? 1000;
  const key = process.env.YOUTUBE_API_KEY;
  let ytLeft = key && !process.env.NO_SEARCH ? (cfg.youtubeSearches ?? 9) : 0;
  const out = [];
  for (const id of [...new Set([...wanted, ...picks.flatMap(p => p.ids)])]) {
    const song = byId.get(id);
    if (wanted.includes(id) && key && !done[id]) ytLeft = Math.max(ytLeft, 1);
    if (!song || song.kind !== "本家" || done[id]) continue;
    const nt = normalize(song.t);
    if (nt.length < 2) { done[id] = today; continue; }
    // タイトルに曲名が入っていて、歌ってみたらしいもの（曲名が2文字以下なら「」『』で囲まれているものだけ）
    const okTitle = t => normalize(t).includes(nt) && COVER_WORD.test(t) && !isKaraoke(t) && !/替え歌|パロディ|弾いてみた|演奏してみた|踊ってみた|叩いてみた|UST配布/.test(t) && (nt.length > 2 || new RegExp(`[「『]${song.t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[」』]`).test(t));
    const got = [];
    // ニコニコ
    try {
      const params = new URLSearchParams({ q: `${song.t} 歌ってみた`, targets: "title,tags",
        fields: "contentId,title,tags,startTime,viewCounter,likeCounter,thumbnailUrl,userId,channelId",
        "filters[viewCounter][gte]": String(minViews), _sort: "-viewCounter", _limit: "30", _context: "vocalo-tagcho" });
      const started = Date.now();
      const res = await fetch("https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?" + params, { headers: { "User-Agent": config.userAgent } });
      if (res.ok) {
        const before = Date.parse(song.date) - 30 * 864e5;   // 原曲より30日以上前の動画は別の曲
        const rows = ((await res.json()).data || []).filter(r => !known.has("nico:" + r.contentId) && okTitle(unxml(r.title || "")) && !(Date.parse(r.startTime) < before)).slice(0, perSong);
        for (const r of rows) got.push({ src: "niconico", id: "nico:" + r.contentId, url: "https://www.nicovideo.jp/watch/" + r.contentId,
          title: unxml(r.title || ""), tags: (r.tags || "").split(" ").filter(Boolean).map(unxml), date: r.startTime, views: r.viewCounter, likes: r.likeCounter,
          thumb: r.thumbnailUrl, uploaderId: r.userId ?? r.channelId ?? null, req: song.id });
      }
      await sleep(Math.max(1000, Date.now() - started));
    } catch (e) { console.warn(`投稿ネタの歌ってみた（ニコニコ）「${song.t}」: ${e.message}`); }
    // YouTube（検索は1回100ユニットなので回数を決めておく）
    const ytTried = ytLeft > 0;
    if (ytLeft > 0) {
      ytLeft--;
      // 手で頼んだ曲は「歌ってみた」と「cover」の2回探して、多めに入れる（転載・字幕つきの再アップロードは入れない）
      const isWanted = wanted.includes(id);
      const ytIds = [];
      for (const q of isWanted ? [`${song.t} 歌ってみた`, `${song.t} cover`] : [`${song.t} 歌ってみた`]) {
        const params = new URLSearchParams({ part: "id", type: "video", q, order: "viewCount", maxResults: isWanted ? "25" : "15", regionCode: "JP", relevanceLanguage: "ja", key });
        const res = await ytFetch("https://www.googleapis.com/youtube/v3/search?" + params);
        if (res.ok) ytIds.push(...((await res.json()).items || []).map(it => it.id?.videoId).filter(v => v && !known.has("yt:" + v) && !ytIds.includes(v)));
        else console.warn(`投稿ネタの歌ってみた（YouTube）「${song.t}」: HTTP ${res.status}`);
      }
      const vs = (await ytVideos(ytIds, key)).filter(v => !isNoise(v) && !(Date.parse(v.snippet?.publishedAt) < Date.parse(song.date) - 30 * 864e5) && Number(v.statistics?.viewCount || 0) >= minViews && okTitle(v.snippet?.title || "") && !/字幕|転載|reupload|re-upload/i.test(v.snippet?.title || ""))
        .sort((a, b) => Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0)).slice(0, isWanted ? perSong * 2 : perSong);
      for (const v of vs) got.push({ ...ytItem(v, song.g), req: song.id });
    }
    for (const v of got) known.add(v.id);
    out.push(...got);
    // 手動の実行（YouTube検索なし）のときは、あとの毎朝の実行でYouTubeも探せるように記録しない
    if (ytTried || !key) done[id] = today;
    console.log(`投稿ネタの歌ってみた「${song.t}」: ${got.length}件${got.length ? `（${got.map(v => v.title.slice(0, 25)).join("／")}）` : ""}`);
  }
  await writeFile(path("data/pick-covers-done.json"), JSON.stringify(done) + "\n");
  return out;
}

// ---------- Topic の差しかえ：「〇〇 - Topic」の自動生成音源（埋め込みで再生できない）の曲を、同じアーティストの公式チャンネルの動画から探す ----------
// 公式チャンネル＝サイトにある YouTube の本家のうち、チャンネル名にそのアーティスト名が入っているもの。動画一覧（50本で1ユニット）だけを使う
async function fetchTopicReplacements(items) {
  const key = process.env.YOUTUBE_API_KEY;
  const cfg = config.youtube.topicReplace || {};
  if (!key || cfg.enabled === false) return [];
  const done = await readJson("data/topic-done.json", {});
  const recheck = new Date(Date.now() - (cfg.recheckDays || 30) * 864e5).toISOString();
  const topics = items.filter(i => i.src === "youtube" && i.kind === "本家" && !i.dup && / - Topic$/.test(i.uploader || ""));
  const known = new Set(items.map(i => i.id));
  // アーティスト名 → 公式チャンネル（Topic 以外で、チャンネル名にアーティスト名が入っている。いちばん曲の多いもの）
  const chans = new Map();
  for (const i of items) if (i.src === "youtube" && i.uploaderId && !/ - Topic$/.test(i.uploader || "")) { const c = chans.get(i.uploaderId) || { name: i.uploader || "", n: 0 }; c.n++; chans.set(i.uploaderId, c); }
  const byArtist = new Map();
  for (const t of topics) {
    const artist = normalize(t.uploader.replace(/ - Topic$/, ""));
    if (artist.length < 2 || byArtist.has(artist)) continue;
    const hit = [...chans].filter(([, c]) => normalize(c.name).includes(artist)).sort((a, b) => b[1].n - a[1].n)[0];
    if (hit) byArtist.set(artist, hit[0]);
  }
  const out = [];
  let looked = 0;
  for (const [artist, chId] of byArtist) {
    if (done[chId] > recheck || looked >= (cfg.maxChannelsPerRun || 30)) continue;
    looked++;
    const want = topics.filter(t => normalize(t.uploader.replace(/ - Topic$/, "")) === artist).map(t => normalize(t.t)).filter(Boolean);
    const found = new Map();
    let pageToken = "";
    for (let page = 0; page < (cfg.maxPages || 8); page++) {
      const params = new URLSearchParams({ part: "snippet", playlistId: "UU" + chId.slice(2), maxResults: "50", key, ...(pageToken ? { pageToken } : {}) });
      const res = await ytFetch("https://www.googleapis.com/youtube/v3/playlistItems?" + params);
      if (!res.ok) break;
      const body = await res.json();
      for (const it of body.items || []) {
        const vid = it.snippet?.resourceId?.videoId, title = it.snippet?.title || "";
        if (!vid || known.has("yt:" + vid) || isKaraoke(title) || /live|ライブ|short|ショート|teaser|trailer|lyric|リリック|tv\s*size/i.test(title)) continue;
        const w = want.find(t => normalize(title).includes(t));
        if (w && !found.has(w)) found.set(w, vid);
      }
      pageToken = body.nextPageToken;
      if (!pageToken || found.size >= want.length) break;
    }
    const got = (await ytVideos([...found.values()], key)).filter(v => isJapanese(v) && !isNoise(v)).map(v => ({ ...ytItem(v, "J-POP"), seed: true }));
    out.push(...got);
    done[chId] = new Date().toISOString();
    console.log(`Topicの差しかえ「${artist}」: ${want.length}曲中 ${got.length}曲の公式動画を見つけた`);
  }
  await writeFile(path("data/topic-done.json"), JSON.stringify(done) + "\n");
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
     ...(SEED ? [] : await fetchCatalogs(await readJson("data/songs.json", [])).catch(e => (console.warn("公式チャンネルの人気曲の取得失敗:", e.message), []))),
     ...(SEED ? [] : await fetchTopicReplacements(await readJson("data/songs.json", [])).catch(e => (console.warn("Topicの差しかえに失敗:", e.message), []))),
     ...(SEED ? [] : await fetchManual(new Set((await readJson("data/songs.json", [])).map(i => i.id))).catch(e => (console.warn("手で追加する動画の取得失敗:", e.message), []))),
     ...(SEED ? [] : await fetchRequests(await readJson("data/songs.json", [])).catch(e => (console.warn("歌ってみたのリクエストの確認に失敗:", e.message), []))),
     ...(SEED ? [] : await fetchPickCovers(await readJson("data/songs.json", [])).catch(e => (console.warn("投稿ネタの歌ってみたの取得に失敗:", e.message), [])))];

const outFile = fixtureArg > -1 ? "data/songs.sample.json" : "data/songs.json";
const existing = new Map((await readJson(outFile, [])).map(i => [i.id, i]));
const overrides = await readJson("data/overrides.json", {});

let statsOnly = 0;
for (const v of videos) {
  if (v.linkOnly) { const prev = existing.get(v.id); if (prev) { prev.req = v.req; prev.of = v.req; prev.ofLocked = true; } continue; }
  if (isKaraoke(v.title) || overrides[v.id]?.skip) continue;
  if (v.updateOnly) {
    const prev = existing.get(v.id);
    if (prev) { prev.views = v.views ?? prev.views; prev.likes = v.likes ?? prev.likes; statsOnly++; }
    continue;
  }
  const fallback = v.channelGenre && v.channelGenre !== "歌ってみた" ? v.channelGenre : "その他";
  const item = classify(v, { fallbackGenre: fallback });
  if (v.seed) item.seed = true;
  if (v.channelGenre === "歌ってみた") { item.kind = "歌ってみた"; item.chCover = true; item.by ||= v.uploader; delete item.p; delete item.v; }
  // 曲ページからリクエストされた歌ってみた：その曲の歌ってみたとして固定する
  if (v.req) { item.kind = "歌ってみた"; item.req = v.req; item.of = v.req; item.ofLocked = true; item.seed = true; item.by ||= singerCore(v.uploader); item.by = fixReqSinger(item.by, v.title, v.uploader, existing.get(v.req)?.p); }
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
items = items.filter(i => !overrides[i.id]?.skip);   // 取り込まないと決めた動画
for (const i of items) {
  const o = overrides[i.id];
  if (o) { Object.assign(i, o); if ("of" in o) i.ofLocked = true; if ("g" in o) i.gFixed = o.g; if ("by" in o) i.byFixed = true; }
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
