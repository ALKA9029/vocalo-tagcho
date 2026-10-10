// 動画のタイトルとタグから「本家／歌ってみた」「ジャンル」「曲名」「作者」「歌声」を判定する。
// ネットにはつながない純粋な関数だけを置いているので、テストしやすい。

export const VOICES = [
  "初音ミク", "鏡音リン", "鏡音レン", "巡音ルカ", "KAITO", "MEIKO", "GUMI", "IA", "flower",
  "可不", "星界", "裏命", "狐子", "羽累", "重音テト", "歌愛ユキ", "結月ゆかり", "紲星あかり", "音街ウナ",
  "初音ミクNT", "知声", "小春六花", "夏色花梨", "花隈千冬", "東北きりたん", "東北ずん子", "ずんだもん",
  "雨衣", "Fukase", "神威がくぽ", "心華", "ONE", "結月ゆかり麗", "VY1", "VY2", "MAYU", "kokone", "SeeU", "UNI",
  "Lily", "CUL", "猫村いろは", "蒼姫ラピス", "鳴花ヒメ", "鳴花ミコト", "ナツメイツキ", "足立レイ", "東北イタコ", "VOCALOID Lily",
];

// 表記ゆれ・英語表記を元の歌声名に（「v flower」「Kagamine Rin」など）
const VOICE_ALIASES = { "vflower": "flower", "v4flower": "flower", "hatsunemiku": "初音ミク", "miku": "初音ミク",
  "kagaminerin": "鏡音リン", "kagaminelen": "鏡音レン", "megurineluka": "巡音ルカ", "kasaneteto": "重音テト", "kafu": "可不",
  // 韓国語の表記
  "하츠네미쿠": "初音ミク", "미쿠": "初音ミク", "카사네테토": "重音テト", "테토": "重音テト", "카가미네린": "鏡音リン",
  "카가미네렌": "鏡音レン", "메구리네루카": "巡音ルカ", "구미": "GUMI", "시유": "SeeU", "유니": "UNI", "카후": "可不" };

const VOCALO_TAGS = ["VOCALOID", "ボカロ", "ボーカロイド", "CeVIO", "CeVIOAI", "SynthesizerV", "UTAU", "VOICEVOX", "NEUTRINO", "VOCALOIDオリジナル曲"];
const JPOP_TAGS = ["J-POP", "JPOP", "J-Pop"];
const COVER_RE = /歌ってみた|歌ってもらった|歌わせてみた|歌わせていただきました|cover(ed)?\b|カバー/i;

export function normalize(s = "") {
  return s.normalize("NFKC").toLowerCase()
    .replace(/[\s　・･\-‐－―_~〜～!！?？.,、。'"’”“♪☆★♡♥]/g, "");
}

const hasTag = (tags, list) => tags.some(t => list.some(x => normalize(t) === normalize(x)));

// カラオケ（ニコカラ・Off Vocal）など、曲そのものではない動画
export const isKaraoke = title => /ニコカラ|off ?vocal|カラオケ|instrumental|インスト/i.test(title || "");

export function detectKind(title, tags) {
  if (tags.some(t => /^歌ってみた/.test(t)) || COVER_RE.test(title)) return "歌ってみた";
  return "本家";
}

export function detectVoice(title, tags) {
  // 長い名前を先に見る（「初音ミクNT」を「初音ミク」と誤判定しないため）
  const byLen = [...VOICES].sort((a, b) => b.length - a.length);
  for (const v of byLen) if (tags.some(t => normalize(t) === normalize(v))) return v;
  for (const t of tags) if (VOICE_ALIASES[normalize(t)]) return VOICE_ALIASES[normalize(t)];
  // 韓国語の歌声名はタイトルの中からも探す
  const nt = normalize(title);
  for (const [k, v] of Object.entries(VOICE_ALIASES)) if (/[\uac00-\ud7af]/.test(k) && k.length >= 2 && nt.includes(k)) return v;
  // 英字の名前（ONE、IA など）は単語として出てきたときだけ（「SixTONES」「ONE N' ONLY」を誤判定しないため）
  for (const v of byLen) {
    if (/^[\x00-\x7F ]+$/.test(v)) { if (v.length >= 4 && new RegExp(`(^|[^A-Za-z])${v}(?![A-Za-z'])`, "i").test(title) && v !== "ONE") return v; }
    else if (v.length >= 3 && title.includes(v)) return v;
  }
  return null;
}

// アニメのタイアップらしい言葉（「アニメMV」はボカロでもよく使うので除く）
const ANIME_RE = /TVアニメ|アニメ[「『]|劇場版|主題歌|オープニング(テーマ)?|エンディング(テーマ)?|ノンクレジット|(?<![A-Za-z])(OP|ED)(?![A-Za-z])|\banime\b/i;
const ANIME_TAGS = ["アニソン", "アニメ", "アニメソング", "anime"];

export function detectGenre(title, tags, fallback = "その他", desc = "") {
  if (hasTag(tags, VOCALO_TAGS) || (detectVoice(title, tags) && !hasTag(tags, JPOP_TAGS))) return "ボカロ";
  if (hasTag(tags, ANIME_TAGS) || ANIME_RE.test(title) || ANIME_RE.test(desc.slice(0, 300))) return "アニソン";
  if (hasTag(tags, JPOP_TAGS)) return "J-POP";
  return fallback;
}

// 歌声の名前か（「重音テトSV」「初音ミクNT」のような後ろの表記ゆれも許す）
export function isVoice(name = "") {
  const n = normalize(name).replace(/(sv|ai|nt|v4x|v3|v4|v5|v6|english|β)$/i, "");
  return !!n && (VOICES.some(v => normalize(v) === n) || !!VOICE_ALIASES[n]);
}

// 表記ゆれ（鏡音リンV4X、重音テトSV など）を、元の歌声名にそろえる
export function canonicalVoice(name = "") {
  const n = normalize(name).replace(/(sv|ai|nt|v4x|v3|v4|v5|v6|english|β)$/i, "");
  return VOICES.find(v => normalize(v) === n) || VOICE_ALIASES[n] || name;
}

// 「初音ミク・みきとP」のような並びを、歌声と作者に分ける
function splitNames(text) {
  const names = text.split(/\s*[・＆&、,]\s*|\s+x\s+|\s+×\s+/).map(x => x.trim()).filter(Boolean);
  return { voices: names.filter(isVoice), others: names.filter(x => !isVoice(x)) };
}

const NOISE = /オリジナル曲?|オリジナル|PV付?|MV|アニメ|Music Video|Full ?ver\.?|フル|付|曲/gi;
const isNoiseText = t => !t.replace(NOISE, "").replace(/[\s・,、]/g, "") || splitNames(t).others.length === 0;
const cleanSong = t => t.replace(/\s*(?:feat\.?|ft\.)\s*.*$/i, "")
  .replace(/を?歌って踊ってみた|を?(踊|弾|叩|ヘコ)ってみた|を?歌ってみた|を?歌ってもらった|を?歌わせてみた|歌わせていただきました|covered by.*$|cover(ed)?|カバー|オリジナル曲?|(アニメ)?MV|Music Video/gi, " ")
  .replace(/[\s、,]*(3D|MMD)?\s*PV.*$/i, "")
  .replace(/\s+/g, " ").trim();
const featOf = t => (t.match(/(?:feat\.?|ft\.)\s*(.+)$/i) || [])[1]?.trim();

// 「原曲の作者 covered by 歌い手」「Cover:歌い手」「〜 重音テトcover」などから、歌い手と原曲の作者を取り出す（ニコニコ・YouTube共通）
// 「coverd by」「Covered By」「cover by秀人」のような表記ゆれも許す
export function readCoverCredit(raw, song = "") {
  const flat = raw.normalize("NFKC").replace(/【[^】]*】|\[[^\]]*\]|#\S+/g, " ").replace(/\s+/g, " ").trim();
  const cleanSinger = x => x.replace(/^\s*(VOCALOID|ボカロ)\s*/i, "").replace(/\s*\+.*$/, "")
    .replace(/\s*[（(].*$/, "").replace(/\s*cover\s*$/i, "").replace(/[\s\-–—:：|｜]+$/, "").trim();
  const cleanOrig = x => x.split(/\s[-–—]\s/).pop().replace(/^.*[「『]|[」』].*$/g, "").replace(/\s*(cover|カバー|歌ってみた)\s*$/i, "")
    .replace(/^[\s\-–—:：|｜\/／]+|[\s\-–—:：|｜\/／]+$/g, "").trim();
  const notSong = x => x && normalize(x) !== normalize(song) && !(normalize(song) && normalize(x).includes(normalize(song)));
  // A) covered by / coverd by / cover by
  let m = flat.match(/(?:^|[\/／|｜]\s*|\s[-–—]\s*)([^\/／|｜]*?)[\s\-–—]*cover(?:e?d)?\s*by\s*[:：]?\s*([^\/／|｜]+)/i);
  if (m) {
    const orig = cleanOrig(m[1]);
    return { singer: cleanSinger(m[2]), original: notSong(orig) ? orig : "" };
  }
  // B) Cover:歌い手
  m = flat.match(/(?:^|[\/／|｜]\s*)([^\/／|｜]*?)\s*cover\s*[:：]\s*([^\/／|｜]+)/i);
  if (m) { const orig = cleanOrig(m[1]); return { singer: cleanSinger(m[2].split(/[,、]/)[0]), original: notSong(orig) ? orig : "" }; }
  // C) 「〜 / 原曲の作者 重音テトcover」のように、歌声名のすぐ後ろに cover
  m = flat.match(/(?:^|[\/／]\s*)([^\/／]*?)\s*(\S+?)\s*cover\b/i);
  if (m && isVoice(m[2])) { const orig = cleanOrig(m[1]); return { singer: canonicalVoice(m[2]), original: notSong(orig) ? orig : "" }; }
  return null;
}

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
    const b = splitNames(before.replace(/より$/, ""));
    if (/より$/.test(before) && !b.voices.length) b.others = [];
    if (b.others.length === 1 && !/\s/.test(b.others[0])) creator = b.others[0];
    const after = s.slice(q.index + q[0].length);
    if (!voice) voice = featOf(after.replace(/【[^】]*】/g, "")) || null;
    if (!creator) {
      const a = after.replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)/g, " ").split(/\s*[\/／]\s*/)[0]
        .replace(/\s*(?:feat\.?|ft\.).*$/i, "").replace(/オリジナル曲?|MV|PV|歌ってみた|cover/gi, " ").trim();
      if (a && !/\s{2,}/.test(a) && a.length <= 30 && !isVoice(a)) creator = a;
    }
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
    // 「／音街ウナ・鏡音リンより」の「より」は「〜から（届いた曲）」の意味なので、作者名ではない
    const fromYori = /より$/.test(who.trim());
    const n = splitNames(who.replace(/より$/, "").replace(/を?歌ってみた|cover(ed)?\s*(by)?|(アニメ)?MV|Music Video|vo\.?/gi, " ").trim());
    if (fromYori && !n.voices.length) n.others = [];
    if (n.others.length) creator = n.others.join("・");
    if (!voice && n.voices.length) voice = n.voices[0];
    if (featVoice) voice = featVoice.replace(/(アニメ)?MV|Music Video/gi, "").trim();
    if (parts.length > 1) originalCreator = parts[0].split(/\s*(?:feat\.|ft\.)\s*/i)[0].trim();
  } else if (!creator) {
    const by = s.match(/covered\s+by\s+(.+)$/i) || s.match(/歌ってみた\s*(?:by|ver\.?)?\s*[【\[]?([^【\[\]】]+)/);
    if (by) creator = by[1].trim();
  }
  // 【IA】【初音ミク＆GUMI】のような括弧の中の歌声
  // 「原曲の作者-Covered by 歌い手」「〜 / VOCALOID KAITO COVER」のような書き方
  const flat = s.replace(/【[^】]*】|\[[^\]]*\]/g, " ");
  const cv = readCoverCredit(s, song);
  if (cv && cv.singer) {
    creator = cv.singer;
    if (cv.original) originalCreator = cv.original;
  }
  if (!voice) for (const br of bracketed) { const v = splitNames(br.slice(1, -1)).voices[0]; if (v) { voice = v; break; } }
  if (voice) voice = splitNames(voice).voices[0] || voice.split(/\s*[・＆&]\s*/)[0];
  return { song: song || raw.trim(), creator, voice, originalCreator, brackets: bracketed };
}

// YouTube向け：チャンネル名を手がかりに「アーティスト」と「曲名」を分ける
// 例）Mrs. GREEN APPLE「共犯」Official Music Video / なにわ男子 - Moonlit [Official Music Video] / 【MV】怠。 / ILLGATOR
const YT_NOISE = /official\s*(music\s*)?(video|mv)|music\s*video|music\s*clip|lyric\s*video|performance\s*video|dance\s*practice(\s*movie)?|special\s*dance\s*performance|visualizer|\bM\/V\b|\bMV\b|MUSiC CLiP/gi;
export function parseYouTube(raw, channel = "") {
  const ch = cleanChannel(channel).replace(/\s*from\s+.*$/i, "").replace(/\s*[（(].*$/, "").trim();
  const hasJa = x => /[぀-ヿ㐀-鿿]/.test(x);
  // 【】の中の歌声（「【GUMI・鏡音リン】」「【IAオリジナル曲・PV付】」など）
  const bracketTexts = [...raw.normalize("NFKC").matchAll(/【([^】]*)】/g)].map(m => m[1]);
  const cleanBr = t => t.replace(/オリジナル曲?|PV付?|MV|HD|曲/gi, " ").trim();
  const bracketVoice = bracketTexts.map(t => splitNames(cleanBr(t)).voices[0]).find(Boolean) || null;
  // 「曲名 【歌声・オリジナル曲】- 作者」：曲名のすぐ後ろに歌声やオリジナル曲の【】があり、そのあとにダッシュが続く
  const songFirstBracket = /^\s*(【[^】]*】\s*)?[^【\-–—]+?\s*【[^】]*】\s*[-–—]/.test(raw.normalize("NFKC"))
    && bracketTexts.some(t => /オリジナル/.test(t) || splitNames(cleanBr(t)).voices.length);
  let s = raw.normalize("NFKC")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|（[^）]*）|<[^>]*>/g, " ")
    .replace(/\s-[^-]{2,}-\s*$/, " ")          // 「-Music Video-」「-from TBS系…-」
    .replace(YT_NOISE, " ").replace(/#\S+/g, " ").replace(/[「『]\s*[」』]/g, " ").replace(/\s+/g, " ").trim();
  // 「日本語の部分 / English translation」のように、後ろにある英語だけの部分（翻訳）を外す
  const sections = s.split(/\s*[\/／|｜]\s*|\s+,\s+/).filter(Boolean);
  const kept = sections.filter((x, i) => i === 0 || hasJa(x) || !sections.slice(0, i).some(hasJa));
  if (kept.length < sections.length) s = kept.join(" / ");

  const chNames = ch.split(/\s*[,、\/]\s*/).filter(x => x.length >= 2);
  const stripFeat = x => x.replace(/\s*(?:feat\.?|ft\.).*$/i, "").trim();
  const isCh = x => {
    const n = normalize(stripFeat(x));
    return chNames.some(c => { const m = normalize(c); return n === m || (m.length >= 3 && (n.includes(m) || (n.length >= 3 && m.includes(n)))); });
  };
  let song = "", artist = "", otherName = "", voiceFromParts = null;
  let q = s.match(/[「『]([^」』]+)[」』]|"([^"]+)"|(?:^|[\s|｜])'([^']+)'(?:\s|$)/);
  // 「好きだから。/ 『ユイカ』」のように、カギカッコの中がチャンネル名（アーティスト名）なら曲名ではない
  if (q && isCh(q[1] || q[2] || q[3] || "")) {
    s = s.replace(q[0], " " + (q[1] || q[2] || q[3]) + " ").replace(/\s+/g, " ").trim();
    q = null;
  }
  if (q) {
    song = (q[1] || q[2] || q[3]).trim();
    artist = s.slice(0, q.index).replace(/[|｜\/／\-–—:：\s]+$/, "").trim();
    if (!artist && isCh(s.slice(q.index + q[0].length))) artist = ch;
  } else {
    const firstHasDash = /\s[-–—]\s/.test(s.split(/\s*[\/／|｜]\s*/)[0]);
    let parts = s.split(/\s*[|｜\/／]\s*|\s+[-–—]\s+/).map(x => x.trim()).filter(Boolean);
    // 歌声の名前だけの部分（「初音ミク・重音テトSV」など）は、歌声として取り出して外す
    parts = parts.filter(x => {
      const n = splitNames(stripFeat(x));
      if (n.voices.length && !n.others.length) { voiceFromParts ??= canonicalVoice(n.voices[0]); return false; }
      return true;
    });
    const chIdx = parts.findIndex(isCh);
    const pickSong = cands => cands.find(hasJa) || cands[0] || "";
    if (/^THE FIRST TAKE$/i.test(ch) && parts.length >= 2) {
      // THE FIRST TAKE は「アーティスト - 曲名 / THE FIRST TAKE」
      artist = parts[0]; song = parts[1];
    } else if (parts.length >= 2 && chIdx >= 0) {
      const p = stripFeat(parts[chIdx]);
      artist = chNames.some(c => normalize(c) === normalize(p)) ? p : (normalize(p).length <= normalize(ch).length ? p : ch);
      const rest = parts.filter((_, i) => i !== chIdx);
      song = pickSong(rest);
      // 「曲名 - 原曲の作者 / 歌い手(チャンネル)」の形なら、残りを原曲の作者の候補に
      otherName = rest.find(x => x !== song) || "";
    } else if (parts.length >= 2 && firstHasDash && songFirstBracket) {
      // 「曲名【GUMIオリジナル曲】- 作者」のように、曲名のすぐ後ろに歌声やオリジナル曲の【】がある形
      song = parts[0]; artist = parts[1];
    } else if (parts.length >= 2 && firstHasDash) {
      // 「アーティスト - 曲名」。英語訳が並んでいるときは日本語の曲名を選ぶ
      artist = parts[0]; song = pickSong(parts.slice(1));
    } else if (parts.length >= 2) {
      // 「曲名 / アーティスト」。英語だけの部分はチャンネル名と一致するときだけアーティストとみなす
      song = parts[0];
      artist = hasJa(parts[1]) || isCh(parts[1]) ? parts[1] : ch;
    } else {
      song = parts[0] || s;
      // 「千本桜 WhiteFlame feat 初音ミク」のように、曲名のあとにチャンネル名が続く形
      const c = chNames.find(c => c.length >= 3 && stripFeat(song).includes(c) && stripFeat(song) !== c);
      if (c) { song = song.replace(c, " ").replace(/\s+/g, " ").trim(); artist = c; }
    }
  }
  const coverSong = (q ? song : s.split(/\s*[\/／|｜]\s*|\s+[-–—]\s+/)[0]).replace(/\s*cover(?:e?d)?\s*(by.*|[:：].*)?$/i, "").trim();
  const cv = readCoverCredit(raw, coverSong);
  if (cv && cv.singer) {
    const vs = splitNames(cv.singer).voices;
    return { song: coverSong || raw.trim(), creator: cv.original || "", voice: vs.length ? canonicalVoice(vs[0]) : null,
      originalCreator: "", channel: ch, coverSinger: cv.singer, brackets: [] };
  }
  const featVoice = featOf(song) || featOf(artist) || featOf(s.split(/\s*[\/／|｜]\s*/).find(x => featOf(x)) || "");
  song = song.replace(/\s*(?:feat\.?|ft\.)\s*.*$/i, "").replace(/セルフカバー|cover/gi, "")
    .replace(/^[\s\-–—:：|｜]+|[\s\-–—:：|｜]+$/g, "").trim();
  artist = artist.replace(/\s*(?:feat\.?|ft\.)\s*.*$/i, "").replace(/\s*[（(].*$/, "").trim() || ch;
  const fv = featVoice ? (splitNames(featVoice.split(/\s*[\/／]\s*/)[0]).voices[0] || (isVoice(featVoice) ? featVoice : null)) : null;
  return { song: song || raw.trim(), creator: artist, voice: fv ? canonicalVoice(fv) : (voiceFromParts || (bracketVoice && canonicalVoice(bracketVoice))), originalCreator: "", channel: ch, otherName, brackets: [] };
}

// 動画1件 → サイトで使う形
export function classify(video, { fallbackGenre = "その他" } = {}) {
  const tags = video.tags || [];
  const kind = detectKind(video.title, tags);
  const parsed = video.src === "youtube" ? parseYouTube(video.title, video.uploader) : parseTitle(video.title);
  const rawVoice = parsed.voice || detectVoice(video.title, tags);
  const voice = rawVoice ? canonicalVoice(rawVoice) : rawVoice;
  const desc = video.desc || video.descHead || "";
  // YouTubeで「ボカロ」として集めた動画でも、歌声やボカロの手がかりがなければボカロにしない
  const vocaloHint = !!rawVoice || hasTag(tags, VOCALO_TAGS) || /VOCALOID|ボカロ|ボーカロイド|初音ミク|重音テト|可不|Synthesizer ?V|UTAU|CeVIO|보컬로이드|보카로/i.test(`${video.title} ${desc.slice(0, 300)}`);
  const fb = video.src === "youtube" && fallbackGenre === "ボカロ" && !vocaloHint ? "J-POP" : fallbackGenre;
  let g = detectGenre(video.title, tags, fb, desc);
  // タイトルの【】などから歌声が見つかっていれば、ボカロ（アニソン判定は残す）
  if (rawVoice && isVoice(rawVoice) && (g === "J-POP" || g === "その他")) g = "ボカロ";
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
    uploaderId: video.uploaderId ?? null,
    uploader: video.uploader ?? null,
    ...(video.src === "youtube" && (video.descHead || video.desc) ? { descHead: (video.descHead || video.desc).slice(0, 300) } : {}),
  };
  if (kind === "本家") {
    const isVoiceName = isVoice(parsed.creator);
    item.p = (!isVoiceName && parsed.creator) || cleanChannel(video.uploader) || "";
    if (isVoice(item.p)) item.p = "";
    if (voice) item.v = voice;
    // 同じ投稿者なら同じ作者とみなす（名前の書き方がばらばらでもまとまる）。投稿者が分からないときだけ名前でまとめる
    item.a = video.uploaderId ? `${video.src}:${video.uploaderId}` : normalize(item.p);
  } else {
    if (video.src === "youtube") {
      // タイトルに「covered by 歌い手」があればそれを、なければチャンネル名を歌い手とみなす
      parsed.originalCreator = parsed.creator && normalize(parsed.creator) !== normalize(parsed.channel) ? parsed.creator : (parsed.otherName || "");
      parsed.creator = parsed.coverSinger || parsed.channel || parsed.creator;
    }
    item.by = (parsed.creator || video.uploader || "").replace(/^(ver\.?|by)\s*/i, "").replace(/^VOCALOID\s+/i, "").replace(/\s*\+.*$/, "").replace(/\s+/g, " ").trim();
    if (parsed.originalCreator) item.pHint = parsed.originalCreator;
    // 歌い手が歌声（KAITOなど）なら、歌声としても絞り込めるように
    if (isVoice(item.by)) item.v = canonicalVoice(item.by);
    else if (parsed.coverSinger && parsed.voice) item.v = parsed.voice;
    // 原曲の作者が分かれば表示用に入れておく（原曲が見つかればそちらで上書きされる）
    if (item.pHint) { item.p = item.pHint; item.a = normalize(item.pHint); }
  }
  return item;
}

// 歌ってみたを、同じ曲名の本家にひもづける（いちばん古い本家を原曲とみなす）
// YouTubeのチャンネル名からアーティスト名を取り出す（「YOASOBI - Topic」「〇〇 Official YouTube Channel」など）
export function cleanChannel(name) {
  name = name || "";
  return name.replace(/\s*[|｜].*$/, "").replace(/\s+-[^-]+-\s*$/, "").replace(/\s+-\s+[A-Za-z][A-Za-z .]*-?\s*$/, "")
    .replace(/\s*(ch\.?|channel)\s*$/i, "").replace(/\s*-\s*Topic$/i, "").replace(/\s*(official\s*)?(youtube\s*)?(channel|チャンネル)$/i, "")
    .replace(/\s*(official|公式)$/i, "").replace(/\s*\/\s*.*$/, "").trim();
}

// 同じ投稿者の曲で一番よく使われている作者名を、名前のない曲にも入れる
export function fillCreators(items) {
  const names = new Map();
  for (const i of items) if (i.kind === "本家" && i.a && i.p) {
    const m = names.get(i.a) || new Map();
    m.set(i.p, (m.get(i.p) || 0) + 1);
    names.set(i.a, m);
  }
  for (const i of items) if (i.kind === "本家" && i.a && !i.p && names.has(i.a)) {
    i.p = [...names.get(i.a)].sort((x, y) => y[1] - x[1])[0][0];
    i.pFilled = true;
  }
  // それでも作者がいない曲は、同じ曲名・同じジャンルの本家（ニコニコとYouTubeなど）から作者名をもらう
  // 候補が複数あれば、いちばん多く使われている名前（同じ数なら短いほう）を選ぶ
  const byTitle = new Map();
  for (const i of items) if (i.kind === "本家" && i.p && !i.pFilled && normalize(i.t).length >= 2) {
    const k = i.g + "|" + normalize(i.t);
    const m = byTitle.get(k) || new Map();
    m.set(i.p, (m.get(i.p) || 0) + 1);
    byTitle.set(k, m);
  }
  for (const i of items) if (i.kind === "本家" && !i.p) {
    const m = byTitle.get(i.g + "|" + normalize(i.t));
    if (m) { i.p = [...m].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0][0]; i.pFilled = true; }
  }
  return items;
}

// ニコニコの曲：同じ投稿者の動画にいつも付いているタグ（＝その人の名前であることが多い）から、作者名・歌い手名を補う
const GENERIC_TAG = /VOCALOID|ボカロ|ボーカロイド|オリジナル|歌ってみた|殿堂入り|伝説入り|神話入り|ミリオン|再生|MMD|PV|MV|曲|音楽|カバー|cover|UTAU|CeVIO|Synth|VOICEVOX|NEUTRINO|ニコニコ|投稿|祭|コレ|ランキング|プロジェクト|シリーズ|大会|企画|合作|^[0-9]+$/i;
export function inferNamesFromTags(items) {
  const nico = items.filter(i => i.src === "niconico" && i.uploaderId);
  // 歌ってみたには原曲の作者名のタグが付くので、「何人の投稿者が使っているタグか」は本家と歌ってみたで別々に数える
  const tagUsers = { "本家": new Map(), "歌ってみた": new Map() };
  for (const i of nico) for (const t of i.tags || []) { const m = tagUsers[i.kind]; const n = normalize(t); if (!m.has(n)) m.set(n, new Set()); m.get(n).add(i.uploaderId); }
  const byUser = new Map();
  for (const i of nico) { if (!byUser.has(i.uploaderId)) byUser.set(i.uploaderId, []); byUser.get(i.uploaderId).push(i); }
  let filled = 0;
  for (const [, vids] of byUser) {
    const kind = vids.filter(v => v.kind === "本家").length >= vids.length / 2 ? "本家" : "歌ってみた";
    // 「じん(自然の敵P)」と「じん（自然の敵P）」のような表記ゆれは同じタグとして数える
    const cnt = new Map(), rep = new Map();
    for (const i of vids) for (const k of new Set((i.tags || []).map(normalize))) cnt.set(k, (cnt.get(k) || 0) + 1);
    for (const i of vids) for (const t of i.tags || []) if (!rep.has(normalize(t))) rep.set(normalize(t), t);
    const titles = new Set(vids.map(v => normalize(v.t)));
    const allTitles = normalize(vids.map(v => v.title).join(" "));
    const inTitle = t => { const n = normalize(t.replace(/\s*[（(][^)）]*[)）]\s*$/, "")); return n.length >= 2 && allTitles.includes(n); };
    // ほかの投稿者があまり使わないタグ。ただしタイトルにも名前が出てくるなら、少し多くても作者名とみなす
    const ok = t => !isVoice(t) && !GENERIC_TAG.test(t) && !titles.has(normalize(t)) && t.length <= 20
      && (tagUsers[kind].get(normalize(t))?.size || 9) <= (inTitle(t) ? 8 : 2);
    // タイトルにも名前が出てくるタグ（「feat. じん」など）を優先。イラストレーターのタグより作者名を選びやすくする
    const score = (t, c) => c + (inTitle(t) ? 1.5 : 0) + (/[PＰ]$/.test(t) ? 0.3 : 0);
    let name = "";
    if (vids.length >= 2) {
      const need = Math.max(2, Math.ceil(vids.length * 0.6));
      name = [...cnt].map(([k, c]) => [rep.get(k), c]).filter(([t, c]) => c >= need && ok(t)).sort((a, b) => score(...b) - score(...a) || a[0].length - b[0].length)[0]?.[0] || "";
    } else {
      // 動画が1本だけの人は、「〇〇P」のようなボカロPらしいタグだけ使う
      name = (vids[0].tags || []).find(t => /[PＰ]$/.test(t) && ok(t)) || "";
    }
    if (!name) continue;
    // 「和田たけあき(くらげP)」→「和田たけあき」のように、後ろの括弧（別名）は外して表示する
    name = (name.replace(/\s*[（(][^)）]*[)）]\s*$/, "").trim() || name).normalize("NFKC");
    for (const i of vids) {
      if (i.kind === "本家" && (!i.p || i.pFilled)) { i.p = name; i.pFilled = false; i.pFromTag = true; filled++; }
      else if (i.kind === "歌ってみた" && !i.by) { i.by = name; filled++; }
    }
  }
  return filled;
}

// ジャンルが分からない歌ってみたを、タグやボカロPの名前から「ボカロ」に振り分ける
//   ・「ボカロオリジナルを歌ってみた」のようなタグがある
//   ・タグかタイトルに、サイトに載っているボカロPの名前（2曲以上ある人）が出てくる（「洗脳(DECO*27)」「/ syudou」など）
export function guessCoverGenre(items) {
  const cnt = new Map();
  for (const i of items) if (i.kind === "本家" && i.g === "ボカロ" && i.p) cnt.set(normalize(i.p), (cnt.get(normalize(i.p)) || 0) + 1);
  const vocaloPs = [...cnt].filter(([n, c]) => c >= 2 && n.length >= 2 && !isVoice(n)).map(([n]) => n);
  let changed = 0;
  for (const c of items) {
    if (c.kind !== "歌ってみた" || c.g !== "その他") continue;
    const tags = c.tags || [];
    const hay = normalize([c.title, ...tags].join(" "));
    const hit = tags.some(t => /ボカロ.*歌ってみた|VOCALOID.*歌ってみた|ボカロ曲/i.test(t)) || vocaloPs.some(n => hay.includes(n));
    if (hit) { c.g = "ボカロ"; changed++; }
  }
  return changed;
}

// YouTubeで、ボカロの本家をよく出しているチャンネルの曲は、歌声の手がかりがなくてもボカロにする（Kikuo「愛して愛して愛して」など）
export function guessChannelGenre(items) {
  const tally = new Map();
  for (const i of items) if (i.src === "youtube" && i.kind === "本家" && i.uploaderId) {
    const t = tally.get(i.uploaderId) || { v: 0, n: 0 };
    t.n++; if (i.g === "ボカロ") t.v++;
    tally.set(i.uploaderId, t);
  }
  for (const i of items) {
    const t = tally.get(i.uploaderId);
    if (i.src === "youtube" && i.kind === "本家" && i.g === "J-POP" && t && t.v >= 1 && t.v / t.n >= 0.5) i.g = "ボカロ";
  }
}

export function linkCovers(items) {
  inferNamesFromTags(items);
  guessChannelGenre(items);
  fillCreators(items);
  const originals = new Map();
  for (const i of items.filter(x => x.kind === "本家").sort((a, b) => (a.date || "").localeCompare(b.date || ""))) {
    const k = normalize(i.t);
    if (k && !originals.has(k)) originals.set(k, i);
  }
  for (const c of items) {
    if (c.kind !== "歌ってみた" || c.ofLocked) continue;
    const o = originals.get(normalize(c.t));
    if (o) { c.of = o.id; c.p = o.p || c.p; c.a = o.p ? o.a : (c.a || o.a); if (c.g === "その他") c.g = o.g; }
  }
  guessCoverGenre(items);
  return items;
}

// サイト表示用：必要な項目だけにした軽いデータ
const unent = s => typeof s === "string" ? s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'") : s;
const KEEP = ["id", "src", "url", "title", "t", "kind", "g", "p", "v", "by", "of", "a", "date", "views", "thumb"];
export const toSite = items => items.map(i => Object.fromEntries(KEEP.filter(k => i[k] != null && i[k] !== "").map(k => [k, unent(i[k])])));
