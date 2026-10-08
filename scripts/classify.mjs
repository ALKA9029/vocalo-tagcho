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

// 「曲名 / 作者 feat. 歌声」「【初音ミク】曲名【オリジナル】」「曲名 歌ってみた／歌い手」などから曲名と名前を取り出す
export function parseTitle(raw) {
  let s = raw.normalize("NFKC").trim();
  const quoted = s.match(/[「『]([^」』]+)[」』]/);
  const bracketed = s.match(/【([^】]+)】|\[([^\]]+)\]/g) || [];
  // 【】[]（）() の中身は曲名ではないので消す。閉じ忘れの「(」はそこから後ろを消す
  let rest = s.replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|（[^）]*）/g, " ").replace(/[（(][^\/／]*/g, " ").trim();

  let credit = "";
  const slash = rest.split(/\s*[\/／]\s*/);
  if (slash.length > 1) { rest = slash[0]; credit = slash.slice(1).join(" / "); }

  let song = quoted ? quoted[1] : rest;
  song = song.replace(/\s*(?:feat\.?|ft\.)\s*.*$/i, "")
    .replace(/を?歌ってみた|を?歌ってもらった|を?歌わせてみた|歌わせていただきました|covered by.*$|cover(ed)?|カバー|オリジナル曲?|(アニメ)?MV|Music Video/gi, " ")
    .replace(/\s+/g, " ").trim();

  let creator = "", voice = null, originalCreator = "";
  if (credit) {
    const parts = credit.split(/\s*[\/／]\s*/);
    // 歌ってみたは「曲名 / 原曲の作者 / 歌い手」の形が多いので、最後を歌い手とみなす
    const main = parts[parts.length - 1];
    const feat = main.split(/\s*(?:feat\.|ft\.|\bwith\s)\s*/i);
    creator = feat[0].replace(/を?歌ってみた|cover(ed)?\s*(by)?|(アニメ)?MV|Music Video/gi, "").trim();
    if (feat[1]) voice = feat[1].replace(/(アニメ)?MV|Music Video/gi, "").trim();
    if (parts.length > 1) originalCreator = parts[0].split(/\s*(?:feat\.|ft\.)\s*/i)[0].trim();
  } else {
    const by = s.match(/covered\s+by\s+(.+)$/i) || s.match(/歌ってみた\s*(?:by|ver\.?)?\s*[【\[]?([^【\[\]】]+)/);
    if (by) creator = by[1].trim();
  }
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
    const isVoiceName = VOICES.some(v => normalize(v) === normalize(parsed.creator));
    item.p = (!isVoiceName && parsed.creator) || video.uploader || "";
    if (voice) item.v = voice;
    item.a = normalize(item.p) || `${video.src}:${video.uploaderId || ""}`;
  } else {
    item.by = parsed.creator || video.uploader || "";
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
