// 検索エンジン向けに、曲ごと・作者ごと・タグごとのページを書き出す（GitHub Pages でそのまま公開される）
//   node scripts/pages.mjs                 タグの票も Supabase から読み込む
//   node scripts/pages.mjs --no-votes      票を読まない（ネットにつながらない環境での確認用）
//
// 出力：song/<id>/index.html（本家1曲ごと）、p/<作者>/index.html（2曲以上ある作者）、
//       tag/<タグ>/index.html、tag/index.html、sitemap.xml、robots.txt
// 再生数のような毎日変わる数字は入れない（毎日すべてのページが書き換わってリポジトリが重くなるため）
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";

const SITE = "https://tagtune.net";
const SUPABASE_URL = "https://qfepllrtalfvyhsezjwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_DIFM6mVEbJaB0OYSkY74Hw_1oF_6eaU";   // 公開用の鍵
const TAGS = ["爽やか","エモい","切ない","かっこいい","かわいい","踊れる","疾走感","中毒性","泣ける","落ち着く","ピアノが好き","ギターが好き"];
const TAG_SLUG = { "爽やか":"sawayaka","エモい":"emoi","切ない":"setsunai","かっこいい":"kakkoii","かわいい":"kawaii","踊れる":"odoreru",
  "疾走感":"shissoukan","中毒性":"chudokusei","泣ける":"nakeru","落ち着く":"ochitsuku","ピアノが好き":"piano","ギターが好き":"guitar" };
const FIXED_AT = 3;
const MIN_CREATOR_SONGS = 2;

const path = p => new URL("../" + p, import.meta.url);
const items = JSON.parse(await readFile(path("data/site.json"), "utf8"));
const byId = new Map(items.map(i => [i.id, i]));

// ---------- タグの票 ----------
async function loadVotes() {
  if (process.argv.includes("--no-votes")) return {};
  const all = {};
  try {
    for (let from = 0; ; from += 1000) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_tag_counts`, {
        method: "POST", body: "{}",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", "Range-Unit": "items", Range: `${from}-${from + 999}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const rows = await res.json();
      for (const r of rows) { (all[r.song_id] ??= {})[r.tag] = Number(r.n); }
      if (rows.length < 1000) break;
    }
  } catch (e) { console.warn("タグの票を読めなかったので、票なしでページを作ります:", e.message); return {}; }
  return all;
}
const votes = await loadVotes();

// ---------- 道具 ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
const songSlug = id => id.replace(/^nico:/, "nico-").replace(/^yt:/, "yt-");
const songUrl = id => `/song/${songSlug(id)}/`;
const realKey = a => a && !/:$/.test(a);
const creatorSlug = a => /^(youtube|nico|niconico):/.test(a)
  ? a.replace(/^youtube:/, "yt-").replace(/^(niconico|nico):/, "nico-").replace(/[^A-Za-z0-9_-]/g, "_")
  : "n-" + createHash("sha1").update(a).digest("hex").slice(0, 12);
const fmtDate = d => d ? d.slice(0, 10).replace(/-/g, "/") : "";
const srcName = i => i.src === "youtube" ? "YouTube" : "ニコニコ動画";
const playUrl = id => `/?id=${encodeURIComponent(id)}`;
const tagUrl = t => `/tag/${TAG_SLUG[t]}/`;
const byNewest = (a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
const credit = i => [i.p, i.v && `feat. ${i.v}`].filter(Boolean).join(" ");
const tagsOf = id => Object.entries(votes[id] || {}).filter(([t, n]) => n > 0 && TAGS.includes(t)).sort((a, b) => b[1] - a[1] || TAGS.indexOf(a[0]) - TAGS.indexOf(b[0]));

// 作者ページ：本家が2曲以上ある作者だけ
const creators = new Map();   // a -> { songs, name }
for (const i of items) if (i.kind === "本家" && realKey(i.a) && i.p) {
  const c = creators.get(i.a) || { songs: [], names: new Map() };
  c.songs.push(i); c.names.set(i.p, (c.names.get(i.p) || 0) + 1);
  creators.set(i.a, c);
}
for (const [a, c] of creators) {
  if (c.songs.length < MIN_CREATOR_SONGS) { creators.delete(a); continue; }
  c.name = [...c.names].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0][0];
  c.url = `/p/${creatorSlug(a)}/`;
  c.songs.sort(byNewest);
}
const coversOf = new Map();
for (const i of items) if (i.kind === "歌ってみた" && i.of && byId.has(i.of)) (coversOf.get(i.of) || coversOf.set(i.of, []).get(i.of)).push(i);
for (const list of coversOf.values()) list.sort((a, b) => (b.self || 0) - (a.self || 0) || byNewest(a, b));

// ---------- ページの外枠 ----------
function page({ title, description, url, image, body, jsonld, crumbs = [] }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="TagTune（タグチューン）">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${url}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;700&family=DM+Mono&display=swap">
<link rel="stylesheet" href="/assets/page.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
<div class="wrap">
<div class="top">
  <a class="logo" href="/">Tag<span>Tune</span></a>
  <p class="crumb"><a href="/">トップ</a>${crumbs.map(([label, href]) => ` › ${href ? `<a href="${href}">${esc(label)}</a>` : esc(label)}`).join("")}</p>
</div>
${body}
<footer>
  <a href="/">TagTune トップ</a>
  <a href="/tag/">タグから探す</a>
  <a href="/about.html">このサイトについて</a>
  <a href="/about.html#contact">お問い合わせ・掲載の取り下げ</a>
</footer>
</div>
</body>
</html>
`;
}

const tagChips = (id, emptyText) => {
  const t = tagsOf(id);
  if (!t.length) return `<p class="note">${emptyText}</p>`;
  return `<div class="tags">${t.map(([tag, n]) => `<a class="tag${n >= FIXED_AT ? " fixed" : ""}" href="${tagUrl(tag)}">${esc(tag)}<span class="n">${n}</span></a>`).join("")}</div>`;
};
const thumbImg = i => i.thumb ? `<img src="${esc(i.thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : "";
const li = (i, name, sub) => `<li${i.thumb ? "" : ' class="nothumb"'}>${thumbImg(i)}<div><div class="name">${name}</div><div class="sub">${sub}</div></div></li>`;
const creatorLink = i => { const c = creators.get(i.a); return c ? `<a href="${c.url}">${esc(i.p)}</a>` : esc(i.p); };

// ---------- 曲ページ ----------
function songPage(i) {
  const covers = coversOf.get(i.id) || [];
  const c = creators.get(i.a);
  const who = credit(i);
  const title = covers.length
    ? `${i.t}${i.p ? ` / ${i.p}` : ""}｜歌ってみた${covers.length}件と印象タグ - TagTune`
    : `${i.t}${who ? ` / ${who}` : ""}｜印象タグ - TagTune`;
  const description = `「${i.t}」${i.p ? `（${who}）` : ""}の${srcName(i)}の動画${covers.length ? `と、歌ってみた${covers.length}件` : ""}をまとめたページ。聴いた人がつけた「エモい」「爽やか」などの印象タグで、似た曲も探せます。`;
  const creditLine = [
    i.p && `作者：${creatorLink(i)}`,
    i.v && `歌声：${esc(i.v)}`,
  ].filter(Boolean).join("　") || "作者不明";
  const others = c ? c.songs.filter(x => x.id !== i.id).slice(0, 12) : [];
  const body = `
<header class="hero">
  ${i.thumb ? `<img class="thumb" src="${esc(i.thumb)}" alt="「${esc(i.t)}」のサムネイル" referrerpolicy="no-referrer">` : ""}
  <div>
    <h1>${esc(i.t)}</h1>
    <p class="credit">${creditLine}</p>
    <p class="meta"><span class="badge genre">${esc(i.g)}</span><span class="badge">本家</span><span>${srcName(i)}</span><span>${fmtDate(i.date)} 投稿</span></p>
    <p class="actions">
      <a class="btn primary" href="${playUrl(i.id)}">▶ TagTuneで聴く</a>
      <a class="btn" href="${esc(i.url)}" target="_blank" rel="noopener">${srcName(i)}で見る ↗</a>
    </p>
  </div>
</header>
<p class="note">動画タイトル：${esc(i.title)}</p>

<section>
  <h2>みんなの印象タグ</h2>
  ${tagChips(i.id, `まだタグがついていません。<a href="${playUrl(i.id)}">TagTuneで聴いて</a>、最初のタグをつけてみよう。`)}
</section>

<section>
  <h2>「${esc(i.t)}」の歌ってみた${covers.length ? `（${covers.length}件）` : ""}</h2>
  ${covers.length ? `<ul class="list">${covers.map(x => li(x,
      `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.by || "歌い手不明")}</a>`,
      `${x.self ? '<span class="badge self">セルフカバー</span>' : ""}<span>${srcName(x)}</span><span>${fmtDate(x.date)}</span><a href="${playUrl(x.id)}">▶ TagTuneで聴く</a>${tagsOf(x.id).slice(0, 3).map(([t]) => `<a href="${tagUrl(t)}">#${esc(t)}</a>`).join("")}`
    )).join("")}</ul>` : `<p class="note">TagTuneではまだ見つかっていません。</p>`}
</section>
${others.length ? `
<section>
  <h2>${esc(c.name)}のほかの曲</h2>
  <ul class="list">${others.map(x => li(x, `<a href="${songUrl(x.id)}">${esc(x.t)}</a>`, `<span>${fmtDate(x.date)}</span>${x.v ? `<span>${esc(x.v)}</span>` : ""}${(coversOf.get(x.id) || []).length ? `<span>歌ってみた${coversOf.get(x.id).length}件</span>` : ""}`)).join("")}</ul>
  <p><a href="${c.url}">${esc(c.name)}の曲をすべて見る →</a></p>
</section>` : ""}
`;
  const jsonld = { "@context": "https://schema.org", "@type": "MusicRecording", name: i.t, url: SITE + songUrl(i.id),
    ...(i.p ? { byArtist: { "@type": "MusicGroup", name: i.p } } : {}), ...(i.date ? { datePublished: i.date.slice(0, 10) } : {}),
    ...(i.thumb ? { image: i.thumb } : {}), genre: i.g };
  return page({ title, description, url: songUrl(i.id), image: i.thumb, body, jsonld,
    crumbs: [...(c ? [[c.name, c.url]] : []), [i.t]] });
}

// ---------- 作者ページ ----------
function creatorPage(a, c) {
  const nCovers = c.songs.reduce((n, s) => n + (coversOf.get(s.id) || []).length, 0);
  const title = `${c.name}の曲一覧（${c.songs.length}曲）｜歌ってみた・印象タグ - TagTune`;
  const description = `${c.name}の曲${c.songs.length}曲${nCovers ? `と、その歌ってみた${nCovers}件` : ""}をまとめたページ。聴いた人がつけた印象タグで曲を探せます。`;
  const body = `
<header>
  <h1>${esc(c.name)}</h1>
  <p class="meta"><span>${c.songs.length}曲</span>${nCovers ? `<span>歌ってみた${nCovers}件</span>` : ""}</p>
</header>
<section>
  <h2>曲一覧（新しい順）</h2>
  <ul class="list">${c.songs.map(x => li(x, `<a href="${songUrl(x.id)}">${esc(x.t)}</a>`,
    `<span class="badge genre">${esc(x.g)}</span><span>${fmtDate(x.date)}</span>${x.v ? `<span>${esc(x.v)}</span>` : ""}${(coversOf.get(x.id) || []).length ? `<span>歌ってみた${coversOf.get(x.id).length}件</span>` : ""}${tagsOf(x.id).slice(0, 3).map(([t]) => `<a href="${tagUrl(t)}">#${esc(t)}</a>`).join("")}`
  )).join("")}</ul>
</section>
`;
  return page({ title, description, url: c.url, image: c.songs[0]?.thumb, body, crumbs: [[c.name]],
    jsonld: { "@context": "https://schema.org", "@type": "MusicGroup", name: c.name, url: SITE + c.url } });
}

// ---------- タグページ ----------
function tagPage(tag) {
  const list = items.map(i => [i, votes[i.id]?.[tag] || 0]).filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || byNewest(a[0], b[0])).slice(0, 200);
  const title = `「${tag}」な曲の一覧｜ボカロ・歌ってみた・J-POP - TagTune`;
  const description = `聴いた人が「${tag}」と感じた曲の一覧。ボカロ・J-POP・アニソン・歌ってみたから、みんなの印象タグで探せます。`;
  const body = `
<header>
  <h1>「${esc(tag)}」な曲</h1>
  <p class="note">聴いた人が「${esc(tag)}」のタグをつけた曲を、票の多い順に並べています。</p>
  <p class="actions"><a class="btn primary" href="/?tag=${encodeURIComponent(tag)}">TagTuneで「${esc(tag)}」の曲を聴く</a></p>
</header>
<section>
  <h2>曲一覧${list.length ? `（${list.length}曲）` : ""}</h2>
  ${list.length ? `<ul class="list">${list.map(([x, n]) => {
    const o = x.kind === "歌ってみた" && x.of ? byId.get(x.of) : null;
    const name = x.kind === "本家" ? `<a href="${songUrl(x.id)}">${esc(x.t)}</a>`
      : o ? `<a href="${songUrl(o.id)}">${esc(x.t)}</a>` : `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.t)}</a>`;
    const who = x.kind === "歌ってみた" ? `歌ってみた：${esc(x.by || "歌い手不明")}` : esc(credit(x) || "");
    return li(x, name, `<span class="badge genre">${esc(x.g)}</span><span>${who}</span><span>${n}票</span><a href="${playUrl(x.id)}">▶ 聴く</a>`);
  }).join("")}</ul>` : `<p class="note">まだこのタグがついた曲はありません。<a href="/">TagTune</a>で曲を聴いて、印象タグをつけてみよう。</p>`}
</section>
<section>
  <h2>ほかのタグ</h2>
  <div class="chips">${TAGS.filter(t => t !== tag).map(t => `<a class="tag" href="${tagUrl(t)}">${esc(t)}</a>`).join("")}</div>
</section>
`;
  return page({ title, description, url: tagUrl(tag), body, crumbs: [["タグ", "/tag/"], [tag]] });
}

function tagIndex() {
  const count = t => items.filter(i => (votes[i.id]?.[t] || 0) > 0).length;
  const body = `
<header>
  <h1>タグから探す</h1>
  <p class="note">TagTuneでは、聴いた人が「爽やか」「エモい」などの印象タグを投票しています。気分に合うタグを選んでみてね。</p>
</header>
<section>
  <div class="chips">${TAGS.map(t => `<a class="tag" href="${tagUrl(t)}">${esc(t)}<span class="n">${count(t)}曲</span></a>`).join("")}</div>
</section>
`;
  return page({ title: "印象タグから曲を探す｜爽やか・エモい・切ない… - TagTune",
    description: "聴いた人がつけた「爽やか」「エモい」「切ない」などの印象タグから、ボカロ・歌ってみた・J-POP・アニソンを探せます。",
    url: "/tag/", body, crumbs: [["タグ"]] });
}

// ---------- 書き出し ----------
async function put(rel, html) {
  await mkdir(path(rel.replace(/[^/]+$/, "")), { recursive: true });
  await writeFile(path(rel), html);
}
for (const dir of ["song", "p", "tag"]) await rm(path(dir), { recursive: true, force: true });

const urls = ["/", "/tag/", "/about.html"];
const songs = items.filter(i => i.kind === "本家");
for (const i of songs) { await put(`song/${songSlug(i.id)}/index.html`, songPage(i)); urls.push(songUrl(i.id)); }
for (const [a, c] of creators) { await put(`p/${creatorSlug(a)}/index.html`, creatorPage(a, c)); urls.push(c.url); }
for (const t of TAGS) { await put(`tag/${TAG_SLUG[t]}/index.html`, tagPage(t)); urls.push(tagUrl(t)); }
await put("tag/index.html", tagIndex());

await writeFile(path("sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${SITE}${u}</loc></url>`).join("\n")}
</urlset>
`);
await writeFile(path("robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`ページを書き出しました：曲 ${songs.length}・作者 ${creators.size}・タグ ${TAGS.length}（票のある曲 ${Object.keys(votes).length}）`);
