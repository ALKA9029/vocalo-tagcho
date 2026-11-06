// data/vocadb.json（VocaDB の情報）とサイトの曲を見くらべて、食い違いを数えて出す（確認用。サイトは変えない）
//   node scripts/vocadb-diff.mjs [件数]
import { readFile } from "node:fs/promises";
const site = JSON.parse(await readFile("data/site.json", "utf8"));
const cache = JSON.parse(await readFile("data/vocadb.json", "utf8"));
const N = Number(process.argv[2] || 15);
const norm = s => String(s || "").normalize("NFKC").toLowerCase().replace(/[\s・･.,、。!！?？~〜ー\-_'"’“”「」『』()（）\[\]【】]/g, "");
const byId = new Map(site.map(i => [i.id, i]));
for (const i of site) for (const a of i.alt || []) if (!byId.has(a.id)) byId.set(a.id, i);
const out = { title: [], producer: [], voice: [], type: [], merge: [], missing: [] };
let seen = 0, hit = 0;
for (const [id, c] of Object.entries(cache)) {
  const i = site.find(x => x.id === id); seen++;
  if (!i || !c.s) continue; hit++;
  const s = c.s, line = `${i.id}「${i.t}」/ ${i.p || "-"}`;
  if (norm(s.t) !== norm(i.t)) out.title.push(`${line}  →  「${s.t}」`);
  if (s.p.length && !s.p.some(p => norm(p) === norm(i.p) || norm(i.p).includes(norm(p)))) out.producer.push(`${line}  →  ${s.p.join("・")}`);
  if (s.v.length && i.v && !s.v.some(v => norm(i.v).includes(norm(v)) || norm(v).includes(norm(i.v)))) out.voice.push(`${line}（${i.v}）  →  ${s.v.join("・")}`);
  if (s.type !== "Original" && !i.rm) out.type.push(`${line}  →  ${s.type}${s.orig ? `（元の曲 VocaDB#${s.orig}）` : ""}`);
  for (const pv of s.pvs) {
    if (pv === i.id || (i.alt || []).some(a => a.id === pv)) continue;
    const o = byId.get(pv);
    if (o && o !== i) out.merge.push(`${line}  ＋  ${o.id}「${o.t}」/ ${o.p || "-"}（${o.kind}）`);
    else if (!o) out.missing.push(`${line}  に無い動画  ${pv}`);
  }
}
console.log(`調べた ${seen}曲・VocaDB にあった ${hit}曲`);
const label = { title: "曲名がちがう", producer: "作者がちがう", voice: "歌声がちがう", type: "オリジナル以外（リミックス・カバーなど）", merge: "まとまっていない同じ曲", missing: "サイトに無い同じ曲の動画" };
for (const [k, l] of Object.entries(out)) { console.log(`\n■ ${label[k]}：${l.length}件`); for (const x of l.slice(0, N)) console.log("  " + x); }
