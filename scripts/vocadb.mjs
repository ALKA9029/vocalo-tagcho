// VocaDB（https://vocadb.net）でボカロ曲の「答え合わせ」用の情報を集めて data/vocadb.json にためる。
// サイトのボカロの本家を動画ID（ニコニコの sm〇〇・YouTube のID）で問い合わせて、
// VocaDB での曲名・作者（ボカロP）・歌声・曲の種類（オリジナル／リミックスなど）・元の曲・同じ曲の動画の一覧を記録する。
// VocaDB のデータは CC BY 4.0（出典としてリンクを付ける）。サーバーに負担をかけないよう、1秒に1回まで・1回の実行で決まった数まで。
//
//   node scripts/vocadb.mjs                 ふだん（まだ調べていない曲を人気順に LIMIT 件まで）
//   node scripts/vocadb.mjs --probe sm123   1本だけ問い合わせて、VocaDB の返事をそのまま出す（確認用）
import { readFile, writeFile } from "node:fs/promises";

const LIMIT = Number(process.env.VOCADB_LIMIT || 400);
const UA = "TagTune/1.0 (+https://tagtune.net/about.html)";
const API = "https://vocadb.net/api";
const RECHECK_DAYS = 60;   // 見つからなかった曲は60日たったらもう一度調べる（あとから登録されることがあるため）
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function byPv(id) {
  const [src, pv] = id.startsWith("nico:") ? ["NicoNicoDouga", id.slice(5)] : ["Youtube", id.slice(3)];
  const url = `${API}/songs/byPv?pvService=${src}&pvId=${encodeURIComponent(pv)}&fields=Artists,PVs&lang=Japanese`;
  for (let k = 0; k < 3; k++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 429 || res.status >= 500) { await sleep(5000 * (k + 1)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    return txt && txt !== "null" ? JSON.parse(txt) : null;
  }
  throw new Error("VocaDB が混んでいて返事がない");
}

// VocaDB の返事から、使うところだけ取り出す
function slim(s) {
  if (!s) return null;
  const roles = a => `${a.categories || ""},${a.roles || ""}`;
  const names = f => [...new Set((s.artists || []).filter(a => !a.isSupport && f(a)).map(a => a.artist?.name || a.name).filter(Boolean))];
  const pvs = (s.pvs || []).filter(p => p.pvType === "Original" && (p.service === "NicoNicoDouga" || p.service === "Youtube"))
    .map(p => (p.service === "Youtube" ? "yt:" : "nico:") + p.pvId);
  return {
    id: s.id, t: s.name || s.defaultName, type: s.songType,
    p: names(a => /Producer|Composer/.test(roles(a))), v: names(a => /Vocalist/.test(roles(a))),
    // 作者の別名（英語表記・昔の名前など）。サイトでいつも使っている表記に合わせるときに使う
    pa: (s.artists || []).filter(a => !a.isSupport && /Producer|Composer/.test(roles(a)) && a.artist)
      .map(a => [a.artist.name, ...String(a.artist.additionalNames || "").split(/\s*,\s*/)].filter(Boolean)),
    orig: s.originalVersionId || null, date: (s.publishDate || "").slice(0, 10) || null, pvs,
  };
}

const args = process.argv.slice(2);
if (args[0] === "--probe") {
  const id = /^(sm|so|nm)\d+$/.test(args[1]) ? `nico:${args[1]}` : `yt:${args[1]}`;
  const s = await byPv(id);
  console.log(JSON.stringify(s, null, 1).slice(0, 6000));
  console.log("---- slim ----\n" + JSON.stringify(slim(s), null, 1));
  process.exit(0);
}

const site = JSON.parse(await readFile("data/site.json", "utf8"));
const cache = JSON.parse(await readFile("data/vocadb.json", "utf8").catch(() => "{}"));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const old = d => (Date.parse(today) - Date.parse(d)) / 864e5 > RECHECK_DAYS;
// 調べるのはボカロの本家（ニコニコ・YouTube）。新しい曲を先に、残りは人気順
const todo = site.filter(i => i.kind === "本家" && i.g === "ボカロ" && (i.src === "niconico" || i.src === "youtube"))
  .filter(i => !cache[i.id] || (!cache[i.id].s && old(cache[i.id].at)) || (cache[i.id].s && !cache[i.id].s.pa))   // pa は後から足したので、無いものは調べ直す
  .sort((a, b) => (!!cache[a.id] - !!cache[b.id]) || ((b.date || "") > today.slice(0, 7) ? 1 : 0) - ((a.date || "") > today.slice(0, 7) ? 1 : 0) || (b.views || 0) - (a.views || 0))
  .slice(0, LIMIT);
console.log(`VocaDB：${todo.length}曲を調べる（調べ済み ${Object.keys(cache).length}件）`);
let found = 0, miss = 0, err = 0;
for (const i of todo) {
  // 本家の動画で見つからなければ、まとめてある別のサイトの動画でも調べる
  let s = null;
  try {
    for (const id of [i.id, ...(i.alt || []).map(a => a.id)].slice(0, 2)) { s = await byPv(id); await sleep(1100); if (s) break; }
  } catch (e) { err++; console.log(`  ${i.id}: ${e.message}`); if (err >= 10) { console.log("エラーが多いので今日はここまで"); break; } continue; }
  cache[i.id] = { at: today, s: slim(s) };
  s ? found++ : miss++;
}
console.log(`VocaDB：見つかった ${found}曲・見つからなかった ${miss}曲・エラー ${err}件`);
await writeFile("data/vocadb.json", JSON.stringify(cache) + "\n");
