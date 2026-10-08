// 動画のタイトルとタグから「本家／歌ってみた」「ジャンル」「曲名」「作者」「歌声」を判定する。
// ネットにはつながない純粋な関数だけを置いているので、テストしやすい。

export const VOICES = [
  "初音ミク", "鏡音リン", "鏡音レン", "巡音ルカ", "KAITO", "MEIKO", "GUMI", "IA", "flower", "v flower",
  "可不", "星界", "裏命", "狐子", "羽累", "重音テト", "歌愛ユキ", "結月ゆかり", "紲星あかり", "音街ウナ",
  "初音ミクNT", "知声", "小春六花", "夏色花梨", "花隈千冬", "東北きりたん", "東北ずん子", "ずんだもん",
  "雨衣", "Fukase", "神威がくぽ", "心華", "ONE", "結月ゆかり麗", "VY1", "VY2", "MAYU", "kokone",
];

const VOCALO_TAGS = ["VOCALOID", "ボカロ", "ボーカロイド", "CeVIO", "CeVIOAI", "SynthesizerV", "UTAU", "VOICEVOX", "NEUTRINO", "VOCALOIDオリジナル曲"];
const JPOP_TAGS = ["J-POP", "JPOP", "J-Pop"];
const COVER_RE = /歌ってみた|歌ってもらった|歌わせてみた|歌わせていただきました|cover(ed)?\b|カバー/i;

export function normalize(s = "") {
  return s.normalize("NFKC").toLowerCase()
    .replace(/[\s　・･\-‐－―_~〜～!！?？.,、。'"’”“♪☆★♡♥]/g, "");
}

const hasTag = (tags, list) => tags.some(t => list.some(x => normalize(t) === normalize(x)));

export function detectKind(title, tags) {
  if (tags.some(t => /^歌ってみた/.test(t)) || COVER_RE.test(title)) return "歌ってみた";
  return "本家";
}

export function detectVoice(title, tags) {
  // 長い名前を先に見る（「初音ミクNT」を「初音ミク」と誤判定しないため）
  const byLen = [...VOICES].sort((a, b) => b.length - a.length);
  for (const v of byLen) if (tags.some(t => normalize(t) === normalize(v))) return v;
  for (const v of byLen) if (v.length >= 3 && title.includes(v)) return v;
  return null;
}

export function detectGenre(title, tags, fallback = "その他") {
  if (hasTag(tags, VOCALO_TAGS) || (detectVoice(title, tags) && !hasTag(tags, JPOP_TAGS))) return "ボカロ";
  if (hasTag(tags, JPOP_TAGS)) return "J-POP";
  return fallback;
}

// 歌声の名前か（「重音テトSV」「初音ミクNT」のような後ろの表記ゆれも許す）
export function isVoice(name = "") {
  const n = normalize(name).replace(/(sv|ai|nt|v4x|v3|v4|v5|v6|english|β)$/i, "");
  return !!n && VOICES.some(v => normalize(v) === n);
}

// 「初音ミク・みきとP」のような並びを、歌声と作者に分ける
function splitNames(text) {
  const names = text.split(/\s*[・＆&、,]\s*|\s+x\s+|\s+×\s+/).map(x => x.trim()).filter(Boolean);
  return { voices: names.filter(isVoice), others: names.filter(x => !isVoice(x)) };
}

const NOISE = /オリジナル曲?|オリジナル|PV付?|MV|アニメ|Music Video|Full ?ver\.?|フル|付|曲/gi;
const isNoiseText = t => !t.replace(NOISE, "").replace(/[\s・,、]/g, "") || splitNames(t).others.length === 0;
const cleanSong = t => t.replace(/\s*(?:feat\.?|ft\.)\s*.*$/i, "")
  .replace(/を?歌ってみた|を?歌ってもらった|を?歌わせてみた|歌わせていただきました|covered by.*$|cover(ed)?|カバー|オリジナル曲?|(アニメ)?MV|Music Video/gi, " ")
  .replace(/[\s、,]*(3D|MMD)?\s*PV.*$/i, "")
  .replace(/\s+/g, " ").trim();
const featOf = t => (t.match(/(?:feat\.?|ft\.)\s*(.+)$/i) || [])[1]?.trim();

// 「曲名 / 作者 feat. 歌声」「【初音ミク】曲名【オリジナル】」「作者『曲名』feat. 歌声」「作者 - 曲名」などから曲名と名前を取り出す
export function parseTitle(raw) {
  const s = raw.normalize("NFKC").trim();
  const bracketed = s.match(/【([^】]+)】|\[([^\]]+)\]/g) || [];
  let song = "", creator = "", voice = null, originalCreator = "", credit = "";

  // 1) 「」『』で囲まれた部分のうち、歌声名や「オリジナル曲PV」ではないものを曲名とみなす
  const quotes = [...s.matchAll(/[「『]([^」』]+)[」』]/g)];
  const q = quotes.find(m => !isNoiseText(m[1]));
  if (q) {
    song = q[1];
    voice = featOf(q[1]) || null;
    const before = s.slice(0, q.index).replace(/【[^】]*】|\[[^\]]*\]/g, " ")
      .replace(/オリジナル曲?|MV|PV|が|を?歌ってくれたよ|歌ってみた/g, " ").trim();
    const b = splitNames(before);
    if (b.others.length === 1 && !/\s/.test(b.others[0])) creator = b.others[0];
    const after = s.slice(q.index + q[0].length);
    if (!voice) voice = featOf(after.replace(/【[^】]*】/g, "")) || null;
    const sl = after.split(/\s*[\/／]\s*/);
    if (sl.length > 1) credit = sl.slice(1).join(" / ");
  } else {
    // 2) 【】[]（）() の中身は曲名ではないので消す。閉じ忘れの「(」はそこから後ろを消す
    let rest = s.replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|（[^）]*）|[「『][^」』]*[」』]/g, " ").replace(/[（(][^\/／]*/g, " ").trim();
    const slash = rest.split(/\s*[\/／]\s*/);
    if (slash.length > 1) { rest = slash[0]; credit = slash.slice(1).join(" / "); }
    // 「作者 - 曲名 feat. 歌声」
    const dash = rest.match(/^(.+?)\s+-\s+(.+)$/);
    if (dash && !credit) { creator = dash[1].trim(); rest = dash[2]; }
    voice = featOf(rest) || null;
    song = rest;
  }
  song = cleanSong(song);

  if (credit) {
    const parts = credit.split(/\s*[\/／]\s*/);
    // 歌ってみたは「曲名 / 原曲の作者 / 歌い手」の形が多いので、最後を歌い手とみなす
    const main = parts[parts.length - 1];
    const [who, featVoice] = main.split(/\s*(?:feat\.|ft\.|\bwith\s)\s*/i);
    const n = splitNames(who.replace(/を?歌ってみた|cover(ed)?\s*(by)?|(アニメ)?MV|Music Video|vo\.?/gi, " ").trim());
    if (n.others.length) creator = n.others.join("・");
    if (!voice && n.voices.length) voice = n.voices[0];
    if (featVoice) voice = featVoice.replace(/(アニメ)?MV|Music Video/gi, "").trim();
    if (parts.length > 1) originalCreator = parts[0].split(/\s*(?:feat\.|ft\.)\s*/i)[0].trim();
  } else if (!creator) {
    const by = s.match(/covered\s+by\s+(.+)$/i) || s.match(/歌ってみた\s*(?:by|ver\.?)?\s*[【\[]?([^【\[\]】]+)/);
    if (by) creator = by[1].trim();
  }
  // 【IA】【初音ミク＆GUMI】のような括弧の中の歌声
  if (!voice) for (const br of bracketed) { const v = splitNames(br.slice(1, -1)).voices[0]; if (v) { voice = v; break; } }
  if (voice) voice = splitNames(voice).voices[0] || voice.split(/\s*[・＆&]\s*/)[0];
  return { song: song || raw.trim(), creator, voice, originalCreator, brackets: bracketed };
}

// 動画1件 → サイトで使う形
export function classify(video, { fallbackGenre = "その他" } = {}) {
  const tags = video.tags || [];
  const kind = detectKind(video.title, tags);
  const parsed = parseTitle(video.title);
  const voice = parsed.voice || detectVoice(video.title, tags);
  const g = detectGenre(video.title, tags, fallbackGenre);
  const item = {
    id: video.id,
    src: video.src,
    url: video.url,
    title: video.title,
    t: parsed.song,
    kind,
    g,
    date: video.date,
    views: video.views ?? null,
    likes: video.likes ?? null,
    thumb: video.thumb ?? null,
    tags: tags.slice(0, 30),
  };
  if (kind === "本家") {
    const isVoiceName = isVoice(parsed.creator);
    item.p = (!isVoiceName && parsed.creator) || video.uploader || "";
    if (voice) item.v = voice;
    item.a = normalize(item.p) || `${video.src}:${video.uploaderId || ""}`;
  } else {
    item.by = (parsed.creator || video.uploader || "").replace(/^(ver\.?|by)\s*/i, "").replace(/^VOCALOID\s+/i, "").replace(/\s+/g, " ").trim();
    if (parsed.originalCreator) item.pHint = parsed.originalCreator;
  }
  return item;
}

// 歌ってみたを、同じ曲名の本家にひもづける（いちばん古い本家を原曲とみなす）
export function linkCovers(items) {
  const originals = new Map();
  for (const i of items.filter(x => x.kind === "本家").sort((a, b) => (a.date || "").localeCompare(b.date || ""))) {
    const k = normalize(i.t);
    if (k && !originals.has(k)) originals.set(k, i);
  }
  for (const c of items) {
    if (c.kind !== "歌ってみた" || c.ofLocked) continue;
    const o = originals.get(normalize(c.t));
    if (o) { c.of = o.id; c.p = o.p; c.a = o.a; if (c.g === "その他") c.g = o.g; }
  }
  return items;
}

// サイト表示用：必要な項目だけにした軽いデータ
const unent = s => typeof s === "string" ? s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'") : s;
const KEEP = ["id", "src", "url", "title", "t", "kind", "g", "p", "v", "by", "of", "a", "date", "views"];
export const toSite = items => items.map(i => Object.fromEntries(KEEP.filter(k => i[k] != null && i[k] !== "").map(k => [k, unent(i[k])])));
