// 動画のタイトルとタグから「本家／歌ってみた」「ジャンル」「曲名」「作者」「歌声」を判定する。
// ネットにはつながない純粋な関数だけを置いているので、テストしやすい。

export const VOICES = [
  "初音ミク", "鏡音リン", "鏡音レン", "巡音ルカ", "KAITO", "MEIKO", "GUMI", "IA", "flower",
  "可不", "星界", "裏命", "狐子", "羽累", "重音テト", "歌愛ユキ", "結月ゆかり", "紲星あかり", "音街ウナ",
  "初音ミクNT", "知声", "小春六花", "夏色花梨", "花隈千冬", "東北きりたん", "東北ずん子", "ずんだもん",
  "雨衣", "Fukase", "神威がくぽ", "心華", "ONE", "結月ゆかり麗", "VY1", "VY2", "MAYU", "kokone", "SeeU", "UNI",
  "Lily", "CUL", "猫村いろは", "蒼姫ラピス", "鳴花ヒメ", "鳴花ミコト", "ナツメイツキ", "足立レイ", "東北イタコ", "VOCALOID Lily",
  "宮舞モカ", "弦巻マキ", "闇音レンリ", "春日部つむぎ", "ナースロボ_タイプT", "洛天依", "言和", "Mew", "Ci flower", "AI きりたん",
  "四国めたん", "波音リツ", "桜乃そら", "ルウル", "Yi Xi", "ソラ", "ルク",
];

// 表記ゆれ・英語表記を元の歌声名に（「v flower」「Kagamine Rin」など）
const VOICE_ALIASES = { "vflower": "flower", "v4flower": "flower", "hatsunemiku": "初音ミク", "miku": "初音ミク",
  "kagaminerin": "鏡音リン", "kagaminelen": "鏡音レン", "megurineluka": "巡音ルカ", "kasaneteto": "重音テト", "kafu": "可不",
  // 韓国語の表記
  "하츠네미쿠": "初音ミク", "미쿠": "初音ミク", "카사네테토": "重音テト", "테토": "重音テト", "카가미네린": "鏡音リン",
  "카가미네렌": "鏡音レン", "메구리네루카": "巡音ルカ", "구미": "GUMI", "시유": "SeeU", "유니": "UNI", "카후": "可不" };

const VOCALO_TAGS = ["VOCALOID", "ボカロ", "ボーカロイド", "CeVIO", "CeVIOAI", "SynthesizerV", "UTAU", "VOICEVOX", "NEUTRINO", "VOCALOIDオリジナル曲"];
const JPOP_TAGS = ["J-POP", "JPOP", "J-Pop"];
const COVER_RE = /歌ってみた|歌ってみました|歌いました|歌ってもらった|歌わせてみた|歌わせていただきました|cover(ed)?\b|カバー/i;

export function normalize(s = "") {
  return s.normalize("NFKC").toLowerCase()
    .replace(/[\s　・･\-‐－―_~〜～!！?？.,、。'"’”“♪☆★♡♥]/g, "");
}

const hasTag = (tags, list) => tags.some(t => list.some(x => normalize(t) === normalize(x)));

// カラオケ（ニコカラ・Off Vocal）など、曲そのものではない動画
export const isKaraoke = title => /ニコカラ|off ?vocal|カラオケ|instrumental|インスト/i.test(title || "") || isNotSong(title);

// 曲ではない動画：ショート、ティザー、メイキング、ご報告、企画・バラエティ動画、「〜www」で終わる雑談系など。
// ただし題名（# より前）に「歌ってみた」などがあれば曲として残す（【寝下呂企画】〇〇を歌ってみた など）
const SING_RE = /コラボ|ラップ|歌r|歌っ|歌い|歌う|唄っ|弾いてみ|演奏|cover|カバー|バンド|band|feat|ft\.|MV|PV|主題歌|オリジナル/i;
export function isNotSong(title = "") {
  if (/#shorts?\b/i.test(title)) return true;
  // MMD（3Dモデルが既存の曲で踊る動画）は曲そのものではない
  if (/MMD/i.test(title)) return true;
  // ファンが作った非公式のPV（音は原曲のまま）も、曲として別に並べない
  if (/fan ?made ?PV|ファンメイドPV/i.test(title)) return true;
  // Project DIVA の映像の録画・エディットPV（ゲームの画面に原曲をのせたもの）も同じ
  if (/(エディット|EDIT|合作編集|譜面なし)\s*PV|(60fps|1080P)[^\]]*\].*\bDIVA\b|\bDIVA\b.*(English|Romaji)/i.test(title)) return true;
  // テレビの歌番組の映像や、アニメのオープニング映像、曲の分解動画も曲そのものではない
  // テレビの音楽番組・授賞式での披露（MUSIC AWARDS、FNS歌謡祭、「-from TBS系 〇〇」など）
  if (/presents\s*『[^』]+』|MUSIC AWARDS|歌謡祭|[-–]\s*from\s*(フジテレビ|TBS|日本テレビ|日テレ|テレビ朝日|テレ朝|テレビ東京|NHK)|ミュージックステーション|\bCDTV\b|THE MUSIC DAY/i.test(title)) return true;
  if (/ダイジェスト|\bdigest\b|公式切り抜き|アフターレポート|after movie|プライムデー|Kindle Unlimited|紅白歌合戦|オープニング(ムービー|映像)|エンディング映像|deconstruction|ハイライト】|highlight\b/i.test(title)) return true;
  if (/\bteaser\b|ティザー|\btrailer\b|behind the scenes|メイキング|\bmaking\b|【ご報告】|【お知らせ】|大切なお知らせ|\bstation\b|24\/7|practice (video|ver)|dance practice|grand championship/i.test(title)) return true;
  const main = title.split(/\s#/)[0];
  // 既存の曲に「PVを作ってみた」動画（音は原曲のまま）も曲として別に並べない（歌ってもいるものは残す）
  //  （「ヒャダインのじょーじょーゆーじょーで、PVを作ってみた【ヒャダイン】」のように作者本人が作ったPVは残す）
  const self = (main.match(/【([^】]+)】/) || [])[1];
  if (/(PV|MV|ＰＶ|ＭＶ|ミュージックビデオ)を?作ってみ/.test(main) && !/歌っ|歌い|唄っ|cover|カバー/i.test(main) && !(self && main.includes(self + "の"))) return true;
  if (SING_RE.test(main)) return false;
  // 「#z世代 #平成ソング」のようにハッシュタグが並んでいて、曲名らしい「」／ - がない動画
  if ((title.match(/[#＃]/g) || []).length >= 2 && !SING_RE.test(title) && !/[「『\/／]|\s[-–]\s/.test(main)) return true;
  return /やってみた|練習してみた|[wｗ]{3,}\s*$|【[^】]*(語録|企画|チャレンジ|検証|ドッキリ|密着|vlog|一写入魂)[^】]*】/i.test(main.trim());
}

// タイトルに「オリジナル曲」「【オリジナル】」「[original]」とある動画は本家（「オリジナルMV」「オリジナル振付」は除く）
const ORIGINAL_RE = /オリジナル(曲|楽曲|ソング)|[【\[（(]\s*(オリジナル|original(\s*song)?)\s*[】\]）)]/i;

// 「初音ミクが7人掛かりで『〜』をアカペラしてくれた」のように、歌声に既存の曲を歌わせた動画（タイトルに「オリジナル」がないときだけ）
const WEAK_COVER_RE = /(アカペラ|カバー)し?て(くれ|もらっ)た|アカペラ/;

export function detectKind(title, tags, src) {
  if (COVER_RE.test(title)) return "歌ってみた";
  if (ORIGINAL_RE.test(title)) return "本家";
  if (WEAK_COVER_RE.test(title)) return "歌ってみた";
  // YouTubeのタグは検索よけに「歌ってみた」を入れている本家（作者本人のMVなど）が多いので使わない
  if (src !== "youtube" && tags.some(t => /^歌ってみた/.test(t))) return "歌ってみた";
  // ニコニコの「VOCALOIDカバー曲」「VOCALOIDアニソン」などのタグ：歌声に既存の曲を歌わせたカバー
  if (src !== "youtube" && tags.some(t => /カバー曲$|^(VOCALOID|ボカロ|UTAU|CeVIO|SynthesizerV)(カバー|アニソン|が歌う)/i.test(t))) return "歌ってみた";
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
  // 英字の名前（ONE、IA など）は単語として出てきたときだけ（「SixTONES」「ONE N' ONLY」を誤判定しないため）。flower・Lily は英単語の後ろ（「Wildest Flower」「Waltz for Lily」）では歌声にしない
  for (const v of byLen) {
    if (/^[\x00-\x7F ]+$/.test(v)) { if (v.length >= 4 && new RegExp(`(^|[^A-Za-z])${v}(?![A-Za-z'])`, "i").test(title) && v !== "ONE" && !(/^(flower|Lily)$/.test(v) && new RegExp(`(^|[^A-Za-z])(?!(v4?|ci|feat|ft)\\s)[A-Za-z]+\\s+${v}`, "i").test(title))) return v; }
    else if (v.length >= 3 && title.includes(v)) return v;
  }
  return null;
}

// アニメのタイアップらしい言葉（「アニメMV」はボカロでもよく使うので除く）
const ANIME_RE = /TVアニメ|アニメ[「『]|劇場版|主題歌|オープニング(テーマ)?|エンディング(テーマ)?|ノンクレジット|(?<![A-Za-z])(OP|ED)(?![A-Za-z])|\banime\b|\bfrom\b[^)）]*\b(FILM|THE MOVIE)\b|ONE PIECE/i;
// アニメ・ゲームの曲の手がかり（歌ってみたのジャンル用）。ゲームの曲もアニソンとして扱う
// YouTube の説明文（長め）にアニメ・ゲームの主題歌だと書いてあるか。取得したときに animeDesc として覚えておく
export const ANIME_DESC_RE = /TVアニメ|テレビアニメ|アニメ[「『]|劇場版|アニメーション映画|アニメ映画|アニメ(主題歌|OP|ED|オープニング|エンディング)|(オープニング|エンディング)(テーマ|主題歌)|ノンクレジット|ゲーム[「『][^」』]*[」』].{0,12}(主題歌|テーマ)/;
// 説明文の最初のほう（500文字）で、収録曲リスト（「01. 〜」「・〜」）ではない行にアニメ・ゲームの主題歌と書いてあるか
export const animeInDesc = (desc = "") => desc.slice(0, 500).split(/\n/).some(l => !/^\s*(\d+\s*[.)．]|M\d|[・\-−–#＃])/.test(l) && ANIME_DESC_RE.test(l));
// タイトルの「主題歌」「オープニング」は、ドラマ・テレビ番組・CMのものならアニソンではない
function animeTitle(title = "") {
  if (!ANIME_RE.test(title)) return false;
  return !(/ドラマ|番組|\bCM\b|テレビ系|TV系|日テレ|フジテレビ|テレビ朝日|TBS|NHK|リアリティ|プロ野球|サッカー|甲子園/i.test(title) && !/アニメ|anime|劇場版/i.test(title));
}
const animeOrGame = (title, tags) => tags.some(t => /アニソン|^アニメ(ソング)?$|_?The_Animation|ゲーソン|ゲーム(音楽|ソング|BGM)|^(ゲーム|アニメ)(OP|ED|主題歌)/i.test(t)) || animeTitle(title);
const ANIME_TAGS = ["アニソン", "アニメ", "アニメソング", "anime"];

export function detectGenre(title, tags, fallback = "その他", desc = "") {
  if (hasTag(tags, VOCALO_TAGS) || (detectVoice(title, tags) && !hasTag(tags, JPOP_TAGS))) return "ボカロ";
  if (hasTag(tags, ANIME_TAGS) || animeTitle(title) || ANIME_DESC_RE.test(desc.slice(0, 300))) return "アニソン";
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
  .replace(/〔[^〕]*〕|〈[^〉]*〉|《[^》]*》/g, " ")
  // 歌ってみたの後ろの「ver 歌い手」「by 歌い手」「を歌ってみました」などは曲名ではない
  .replace(/[@＠]\s*(?=(を\s*)?(自分で)?歌って)/g, " ")
  .replace(/(を\s*)?歌って踊ってみた|(を\s*)?(踊|弾|叩|ヘコ)ってみた|(を\s*)?歌ってみ(た|ました)|(を\s*)?歌いました|(を\s*)?歌った|を?歌ってもらった|を?歌わせてみた|歌わせていただきました/g, " ¦ ")
  .replace(/\s*¦[\s。．.]*(ver\.?|by)\s*\S.*$/i, "")
  .replace(/\s+(ver\.?|by)\s*[^\s]+.*$/i, "").replace(/(ver\.?|by)[^\s]{1,12}$/i, "")
  .replace(/covered by.*$|cover(ed)?|カバー|オリジナル曲?|(アニメ)?MV|Music Video/gi, " ")
  .replace(/[\s、,]*(3D|MMD)?\s*PV.*$/i, "")
  .replace(/¦/g, " ").replace(/^[\s✿❀☆★♪♡・。.、]+|[\s✿❀☆★♪♡・。.、]+$/g, "")
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

// 歌い手名の後片付け。「〜歌ってみたのはメガテラ・ゼロ」「『曲』を歌ってみた【ぱなまん】」「を歌わせて頂きました。灯油」
// のように、タイトルの文の切れ端が歌い手名に残ったものを直す。名前が読めなければタイトルの【】の中から探す
const SING_VERB = /(?:歌ってみ(?:た|ました)った?|歌わせて(?:頂|いただ)きました|歌わせてみた|歌いました|歌いたかった|歌った|してみた)[。.]?/g;
const NOT_SINGER = /歌ってみ|歌わせ|cover|カバー|\bMV\b|\bPV\b|フル|キー|ショート|再投稿|アカペラ|替え歌|爆音|推奨|合唱|オリジナル|リレー|提供|ボカロ|VOCALOID|MMD|声真似|remix|edition|コラボ|で$|OP$|ED$|部門|配布|付き|\bfull\b|arrange|^ver\.?$|歌枠|生放送|ニコ生|配信|切り抜き|弾き語り/i;
const isJunkName = n => !n || /w{3,}|ｗ{2,}|だった(から)?$|てみた$|^[。.、\s★☆@＠!！]*$/.test(n) || n.length > 30;
function singerFromBrackets(title) {
  const t = title.normalize("NFKC");
  const cands = [...t.matchAll(/【([^】]+)】|\[([^\]]+)\]|[（(]([^）)]+?)\s*ver\.?\s*[）)]/gi)].map(m => (m[1] || m[2] || m[3] || "").replace(/\s*ver\.?$/i, "").trim());
  for (const c of cands.reverse()) if (c && !NOT_SINGER.test(c) && !isJunkName(c)) return c;
  return "";
}
export function fixSinger(by, title) {
  let n = (by || "").trim();
  if (!n) return "";
  let sentence = false;   // 名前ではなく、タイトルの文の切れ端だった
  if (/^のは/.test(n)) n = n.slice(2).trim();                       // 「歌ってみたのは○○」
  else if (/^[をが]/.test(n) || new RegExp("^" + SING_VERB.source).test(n)) {   // 「〜を歌ってみた。○○」：区切りの後ろだけが名前
    sentence = true;
    const rest = n.replace(/^[をが]/, "").replace(SING_VERB, " ");
    const m = rest.match(/[。.\s★☆@＠]+([^\s。.★☆@＠]+)\s*$/);
    n = m ? m[1] : "";
  }
  // 「ヤラララ、歌ってみたんだけど楽しい とこのこα」のように、歌ってみたに続く文の切れ端なら最後の語だけ
  if (/^[\u3041-\u3093]/.test(n) && /歌ってみた/.test(title) && title.normalize("NFKC").includes("歌ってみた" + n.split(/\s/)[0])) {
    const paren = n.match(/[（(]([^）)]+)[）)]\s*$/);
    const last = n.split(/[\s\/／]+/).pop();
    n = paren ? paren[1] : last !== n ? last : "";
  }
  // 「164 - ウトガワが歌ってみた」の「が」
  if (/[がを]$/.test(n) && title.includes(n + "歌")) n = n.slice(0, -1);
  // 「REIKA )浦和路上ライブ…」の閉じかっこから後ろ
  if (!/[（(]/.test(n)) n = n.replace(/\s*[)）].*$/, "");
  n = n.replace(/^[\s。.、★☆@＠\-‐]+|[\s\-‐]+$/g, "");
  if (/\s[-–—]\s/.test(n)) n = n.split(/\s[-–—]\s/).pop().trim();
  if (sentence || isJunkName(n) || NOT_SINGER.test(n)) {
    if (!n || isJunkName(n) || NOT_SINGER.test(n)) n = singerFromBrackets(title);
  }
  return n;
}

// 動画1件 → サイトで使う形
const LABEL_RE = /^(Sony Music|UNIVERSAL MUSIC|KING RECORDS|キングレコード|VAP|avex|ポニーキャニオン|PONY CANYON|Lantis|ランティス|Aniplex|アニプレックス|TOHO|東宝|Warner|ワーナー|Victor|ビクター|日本コロムビア|COLUMBIA|徳間|FlyingDog|フライングドッグ)/i;
// 「革命道中 - On The Way × TVアニメ『ダンダダン』」のようなコラボ表記も作品名なので外す
const COLLAB_RE = /\s*[×✕]\s*(TVアニメ|テレビアニメ|アニメ|映画|劇場版)?\s*[『「][^』」]+[』」]/g;
// 文の中の歌声の名前を、うしろの「SV」「V4X」などもつけたまま取り出す（「重音テトSV」）
function voiceInText(text, canon) {
  const t = text.normalize("NFKC");
  const names = [canon, ...Object.entries(VOICE_ALIASES).filter(([, v]) => v === canon).map(([k]) => k)];
  for (const n of names) {
    const m = t.match(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s?(SV|AI|NT|V4X|V[2-6]|Append|English)?", "i"));
    if (m) return (m[0].replace(/\s+/g, "")).replace(new RegExp("^" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), canon);
  }
  return null;
}
const pickVoiceName = x => { const n = String(x || "").trim(); if (isVoice(n)) return canonicalVoice(n); return null; };
const TIEIN_RE = /[『「][^』」]{2,}[』」]\s*(?:の)?(?:主題歌|オープニング|エンディング|挿入歌|OP|ED|イメージソング|テーマソング|タイアップ)[^\s　]*/g;
// HoneyWorks のトレードマークの埴輪「┗|∵|┓」のような、タイトルの飾りの顔文字（曲名の読み取りのじゃまになるので外す）
const DECO_RE = /[┗┏└][|｜l]?[∵・][|｜l]?[┓┛┘]/g;

export function classify(video, { fallbackGenre = "その他" } = {}) {
  const shownTitle = video.title;
  if (DECO_RE.test(video.title || "")) video = { ...video, title: video.title.replace(DECO_RE, " ").replace(/【\s*】/g, "").trim() };
  const tags = video.tags || [];
  // YouTube のタグは検索よけに「VOCALOID」「初音ミク」などを何でも入れているチャンネルが多いので、
  // 歌声とボカロの判定には使わない（タイトルと説明文で判定する）
  // （タグと同じ言葉がタイトルか説明文にもあるときだけ、そのタグを使う）
  const hayYT = video.src === "youtube" ? normalize(`${video.title} ${(video.desc || video.descHead || "").slice(0, 600)}`) : "";
  const vtags = video.src === "youtube" ? tags.filter(t => normalize(t).length >= 2 && hayYT.includes(normalize(t))) : tags;
  const kind = detectKind(video.title, tags, video.src);
  // 「『機動戦士ガンダム 閃光のハサウェイ』主題歌」「(TVアニメ『〇〇』OP)」のようなタイアップ先の作品名は、曲名と取りちがえないように外してから読む
  const ytTitle = video.src === "youtube" ? (video.title
    .replace(/[（(\[［【<＜][^()（）\[\]［］【】<>＜＞]*[』」][^()（）\[\]［］【】<>＜＞]*[)）\]］】>＞]/g, " ")   // かっこの中の「(TVアニメ『〇〇』OP)」
    .replace(COLLAB_RE, " ").replace(TIEIN_RE, " ").replace(/\s*※.*$/, "").replace(/\s*[｜|\/／]\s*(TVアニメ|テレビアニメ|映画|ドラマ|フジテレビ系|TBS系|テレビ朝日系|日本テレビ系|NHK)?\s*$/, "")
    .replace(/[\s　]+(映画|TVアニメ|テレビアニメ|アニメ|ドラマ|劇場版)\s*$/, "")
    .replace(/\s+/g, " ").trim() || video.title) : video.title;
  const parsed = video.src === "youtube" ? parseYouTube(ytTitle, video.uploader) : parseTitle(video.title);
  // 歌声は、登録済みの歌声名に当てはまるものだけを使う（「feat. じん」「feat. まふまふ」のような人の名前は歌声にしない）
  const pickVoice = x => { if (!x) return null; if (isVoice(x)) return canonicalVoice(x); const v = splitNames(x).voices[0]; return v ? canonicalVoice(v) : null; };
  const rawVoice = pickVoice(parsed.voice) || pickVoice(detectVoice(video.title, vtags));
  const voice = rawVoice;
  const desc = video.desc || video.descHead || "";
  // YouTubeで「ボカロ」として集めた動画でも、歌声やボカロの手がかりがなければボカロにしない
  const vocaloHint = !!rawVoice || hasTag(vtags, VOCALO_TAGS) || /VOCALOID|ボカロ|ボーカロイド|初音ミク|重音テト|可不|Synthesizer ?V|UTAU|CeVIO|보컬로이드|보카로/i.test(`${video.title} ${desc.slice(0, 300)}`);
  // 「アニメ主題歌」の検索で見つけた動画やアニソン寄りのチャンネルの動画でも、アニメ・ゲームの手がかりがなければアニソンにしない
  const animeHint = animeOrGame(video.title, vtags) || ANIME_DESC_RE.test(desc.slice(0, 600)) || !!video.animeDesc;
  const fb = video.src === "youtube" && fallbackGenre === "ボカロ" && !vocaloHint ? "J-POP"
    : video.src === "youtube" && fallbackGenre === "アニソン" && !animeHint ? "J-POP" : fallbackGenre;
  let g = detectGenre(video.title, vtags, fb, desc);
  // タイトルの【】などから歌声が見つかっていれば、ボカロ（アニソン判定は残す）
  if (rawVoice && isVoice(rawVoice) && (g === "J-POP" || g === "その他")) g = "ボカロ";
  // 「一体いつから - 重音テトSV カバー」のように、曲名の位置に歌声名が入ってしまったら、「 - 」の前を曲名にする
  const dashParts = video.title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (kind === "歌ってみた" && dashParts && isVoice(String(parsed.song || "").split(/[\s|｜]/)[0])) parsed.song = cleanSong(dashParts[1]).trim() || parsed.song;
  // 歌ってみたのジャンルは「元の曲」で決める（原曲が見つかれば、あとで原曲のジャンルに置きかわる）
  if (kind === "歌ってみた") {
    if (animeOrGame(video.title, tags)) g = "アニソン";   // アニメ・ゲームの曲（替え歌も）
    // 初音ミクなどの歌声に歌わせたカバーは、歌声の名前やVOCALOIDタグではボカロにしない
    // （「神威がくぽオリジナル曲」のように、歌声のオリジナル曲だとタイトルにあればボカロのまま）
    else if (rawVoice && g === "ボカロ" && !/オリジナル曲/.test(video.title)) g = tags.some(t => /ボカロ曲|ボーカロイド曲|VOCALOID(オリジナル|曲)/.test(t)) ? "ボカロ" : hasTag(tags, JPOP_TAGS) ? "J-POP" : "その他";
  }
  const item = {
    id: video.id,
    src: video.src,
    url: video.url,
    title: shownTitle,
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
    ...(video.ne ? { ne: 1 } : {}),   // 埋め込みで再生できない動画の印（読み直しでも消さない）
    ...(video.src === "youtube" && (video.descHead || video.desc) ? { descHead: (video.descHead || video.desc).slice(0, 300) } : {}),
  };
  if (kind === "本家") {
    const isVoiceName = isVoice(parsed.creator);
    item.p = (!isVoiceName && parsed.creator) || cleanChannel(video.uploader) || "";
    if (isVoice(item.p)) item.p = "";
    // 「〇〇『ビバハピ』/ Mitchie M」のように、最後の「/ 名前」がチャンネル名と同じなら、それが作者
    if (video.src === "youtube") {
      const tail = (video.title.match(/[\/／]\s*([^\/／【\[(（]+?)\s*$/) || [])[1];
      const ch = cleanChannel(video.uploader || "");
      if (tail && ch && normalize(tail) === normalize(ch) && normalize(item.p) !== normalize(tail) && !(item.p && new RegExp(`^\\s*${item.p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–—]`).test(video.title)) && !/THE FIRST TAKE/i.test(tail)) item.p = tail.trim();
    }
    // 「" どりーみんチュチュ / Dreamin Chuchu " by emon」「インタビュア by クワガタP」の「by 名前」は作者
    {
      const m = video.title.match(/(?<!\b(?:prod\.?|produced|remixed|remix|arranged|arrange|original|stand|side|mixed|mastered|illust(?:rated)?|movie|video|lyrics|付き))\s+by\s+([^\s【\[(（「『"][^【】\[(（「『"|｜/]*?)\s*(?:feat\.?.*)?(?:【|\[|\(|（|$)/i);
      if (m && !/^(you|me|side|the)\b/i.test(m[1])) item.p = m[1].replace(/\(.*$/, "").trim();
    }
    // 「PV付」の「付」のような1文字だけの作者名は読みちがい
    if (item.p && [...item.p.trim()].length <= 1) item.p = "";
    // 「鏡音レン・リン」のように歌声の名前だけが作者の位置に入ったら、チャンネル名を作者に
    if (item.p && item.p.split(/[・&＆,、×]/).every(x => isVoice(x.trim()) || ["リン", "レン", "ミク", "ルカ"].includes(x.trim()))) item.p = cleanChannel(video.uploader) || "";
    if (voice) item.v = voice;
    // 同じ投稿者なら同じ作者とみなす（名前の書き方がばらばらでもまとまる）。投稿者が分からないときだけ名前でまとめる
    item.a = video.uploaderId ? `${video.src}:${video.uploaderId}` : normalize(item.p);
  } else {
    if (video.src === "youtube") {
      // タイトルに「covered by 歌い手」があればそれを、なければチャンネル名を歌い手とみなす
      // チャンネル名「ころんの実況【すとぷり】」から歌い手の名前「ころん」だけを取り出し、
      // タイトルにその名前を含む表記（「ころん×あっきぃ」「【だいきり×たちばな】」）があればそちらを歌い手にする
      const core = singerCore(parsed.channel || video.uploader);
      const brackets = [...video.title.normalize("NFKC").matchAll(/【([^】]+)】|\[([^\]]+)\]/g)].map(m => (m[1] || m[2]).trim());
      // 「ころん×あっきぃ」のようなコラボ表記だけを認める（「KIRA 春希」のように別の語がくっついたものは使わない）
      const isCollabWith = c => c && !NOT_SINGER.test(c) && c.split(/\s*(?:[×xX&＆・、,]|\sand\s|と)\s*/).some(part => normalize(part) === normalize(core));
      const withCh = core && [parsed.creator, ...brackets].find(isCollabWith);
      const creatorIsSinger = withCh && parsed.creator && normalize(parsed.creator) === normalize(withCh);
      parsed.originalCreator = parsed.creator && !creatorIsSinger && normalize(parsed.creator) !== normalize(parsed.channel) ? parsed.creator : (parsed.otherName || "");
      parsed.creator = parsed.coverSinger || withCh || core || parsed.channel || parsed.creator;
    }
    // 「ヒビカセ ver れをる」「小さな恋のうた を歌ってみた。 by天月」のように、ver／by のあとが歌い手
    const verBy = video.title.normalize("NFKC").match(/(?:^|[\s。])(?:ver\.?|by)\s*([^\s【\[（(※#]+)/i);
    item.by = (parsed.creator && /[\p{L}\p{N}]/u.test(parsed.creator) ? parsed.creator : (verBy ? verBy[1] : "") || video.uploader || "")
      .replace(/^[\s。.、]+/, "").replace(/^.*?(?:ver\.?|by)\s*/i, m => /^(ver\.?|by)/i.test(m.trim()) || /[。\s]/.test(m) ? "" : m)
      .replace(/^VOCALOID\s+/i, "").replace(/\s*\+.*$/, "").replace(/\s*※.*$/, "").replace(/\s+/g, " ").trim();
    item.by = fixSinger(item.by, video.title);
    if (parsed.originalCreator) item.pHint = parsed.originalCreator;
    // 歌い手が歌声（KAITOなど）なら、歌声としても絞り込めるように
    if (isVoice(item.by)) item.v = canonicalVoice(item.by);
    else if (parsed.coverSinger && parsed.voice) item.v = parsed.voice;
    // 原曲の作者が分かれば表示用に入れておく（原曲が見つかればそちらで上書きされる）
    if (item.pHint) { item.p = item.pHint; item.a = normalize(item.pHint); }
    // 歌声（重音テトSV など）に歌わせたカバー：歌い手は「重音テトSV（にす）」のように歌声と作った人の両方を出す
    //  （人が歌った歌ってみたのタイトルにある「feat.初音ミク」は原曲の歌声なので数えない）
    const tNoFeat = video.title.replace(/(?:feat\.?|ft\.)\s*[^【\[(（/／|｜]*/gi, " ");
    const humanSung = /歌ってみ|歌いました|歌った|歌って/.test(video.title) && !/歌わせ/.test(video.title);
    const vName = rawVoice && !humanSung ? voiceInText(tNoFeat, rawVoice) : null;
    if (vName && (isVoice(item.by) || /cover|カバー|歌わせ|synthesizer ?v|synthv|vocaloid|cevio|utau|\bust\b|svp|voisona|neutrino/i.test(video.title))) {
      item.v = rawVoice; item.vr = vName;
      // 作った人：YouTube はチャンネル名。ニコニコはタイトル末尾の【〇〇】や「by 〇〇」に書いてある名前だけ（原曲の作者名とまちがえないように）
      if (video.src === "youtube") item.by = video.uploader ? singerCore(video.uploader) : "";
      else {
        const tailName = (video.title.match(/【([^】]+)】\s*$/) || video.title.match(/\bby\s+([^\s【\[(（]+)\s*$/i) || [])[1] || "";
        item.by = tailName && !voiceInText(tailName, rawVoice) && !VOICES.some(x => tailName.includes(x)) && !/cover|カバー|vocaloid|synthesizer|ust|svp|ver\b|ver\.|voicevox|neutrino|cevio|utau|short|full|mix|配布|調声/i.test(tailName) ? tailName.trim() : "";
      }
      if (item.by && VOICES.some(x => normalize(item.by).includes(normalize(x)))) item.by = "";
      if (item.by && item.by.split(/\s*(?:×|✕|&|＆|、|,)\s*/).every(x => isVoice(x) || voiceInText(x, rawVoice))) item.by = "";
    }
  }
  // YouTube の説明文にニコニコの動画へのリンクがあれば覚えておく（転載や、作者自身の再投稿をニコニコ版とまとめるため）
  if (video.src === "youtube") {
    const d = video.desc || video.descHead || "";
    const m = d.match(/(?:nicovideo\.jp\/watch\/|nico\.ms\/)(sm\d+)/);
    if (m) item.nicoSrc = "nico:" + m[1]; else if (video.nicoSrc) item.nicoSrc = video.nicoSrc;
    if (REPRINT_RE.test(d)) item.reprint = 1;
    // 「【初音ミク】愛言葉【オリジナル曲】中文字幕」のような字幕つきの転載も転載あつかい（曲名から「中文字幕」などを外す）
    if (SUB_RE.test(video.title)) { item.reprint = 1; if (item.t) item.t = item.t.replace(SUB_RE, "").replace(/[\[［【(（]\s*[\]］】)）]/g, "").trim() || item.t; }
  }
  // 「細菌汚染 - Bacterial Contamination -」のように「日本語の曲名 - 英語の曲名 -」と両側をダッシュではさんだ書き方は、
  // 左が作者名ではなく曲名（英語は曲名の訳）
  {
    const m = video.title.replace(/【[^】]*】|\[[^\]]*\]/g, " ").match(/^\s*([^-–—]*[^\x00-\x7F][^-–—]*?)\s+[-–—]\s+([A-Za-z][^-–—]*?)\s+[-–—](?:\s|$)/);
    if (m && /[\u3040-\u30ff\u4e00-\u9fff]/.test(m[1]) && item.kind === "本家" && (normalize(item.p || "") === normalize(m[1]) || normalize(item.t || "").startsWith(normalize(m[2]).slice(0, 6)))) {
      item.t = m[1].trim();
      if (normalize(item.p || "") === normalize(m[1])) item.p = "";   // 作者はタグやニコニコ版からあとで補う
    }
  }
  // 「難聴系男子が倒せない- 鏡音リン for LamazeP」の形：「曲名 - 歌声 for 作者」
  {
    const m = video.title.match(/^(.+?)\s*[-–—]\s*([^-–—]+?)\s+for\s+(\S[^【\[(（]*?)\s*$/i);
    if (m && pickVoiceName(m[2])) {
      item.t = cleanSong(m[1].replace(/[（(][^)）]*[)）]\s*$/, "")).trim() || item.t;
      if (item.kind === "本家") { item.p = m[3].trim(); if (!item.v) item.v = pickVoiceName(m[2]); }
    }
  }
  // 「" どりーみんチュチュ / Dreamin Chuchu "」の片方だけ残った引用符を外す
  if (item.t) { const q = (item.t.match(/["“”]/g) || []).length; if (q % 2 === 1) item.t = item.t.replace(/^\s*["“”]\s*|\s*["“”]\s*$/g, "").trim() || item.t; }
  // 曲名のうしろの「HD」「PV」「FULL」などは曲名ではない
  if (item.t) item.t = item.t.replace(/[\s　]+(HD|PV|FULL|full ?ver(sion)?|official ?video|original ?song)$/i, "").trim() || item.t;
  if (video.src === "youtube" && item.t) {
    // 「米津玄師 - 烏　Kenshi Yonezu - Karasu」のように、曲名のうしろに英語の作者名がくっついたら外す
    const m = item.t.match(/^(.*(?:[^\x00-\x7F]|[!?]))[\s　]+([A-Za-z][A-Za-z .'&]*[A-Za-z])$/);
    if (m && new RegExp(`${m[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+[-–—]\\s`).test(video.title)) item.t = m[1];
    // 「SixTONES - NEW ERA - [YouTube Ver.]」のように、曲名が作者名や「〜ver.」になってしまったら、ダッシュで区切ったほかの部分を曲名に
    if (item.kind === "本家" && normalize(item.t) === normalize(item.p || "")) {
      const parts = video.title.split(/\s+[-–—]\s+/).map(x => x.replace(/^[\[【(（]|[\]】)）]$/g, "").trim());
      const alt = parts.length >= 2 && parts.find(x => x && normalize(x) !== normalize(item.p || "") && !/ver\b|ver\.|[｜|]|^(MV|PV|music video|official)/i.test(x) && normalize(x) !== normalize(item.t));
      if (alt) item.t = cleanSong(alt).trim() || item.t;
    }
  }
  // レコード会社のチャンネルの「プライド革命／CHiCO with HoneyWorks」は、レコード会社名ではなく ／ のうしろを作者に
  if (video.src === "youtube" && item.kind === "本家" && LABEL_RE.test(item.p || "")) {
    const m = video.title.match(/^(.+?)\s*[／\/]\s*([^／\/【\[(（]+)/);
    if (m && normalize(cleanSong(m[1])) === normalize(item.t)) item.p = m[2].trim();
  }
  if (item.kind === "本家" && /\bwith HoneyWorks$/i.test(item.p || "")) item.p = "HoneyWorks";   // 「CHiCO with HoneyWorks」なども作者は HoneyWorks
  // 「ヒャダインのじょーじょーゆーじょーで、PVを作ってみた」のように曲名のうしろに「で」「を」などが残ったら、
  // 曲名タグ（ヒャダインのじょーじょーゆーじょー）に合わせる
  if (item.t && !tags.some(x => normalize(x) === normalize(item.t))) {
    const nt = normalize(item.t);
    const tag = tags.find(x => { const n = normalize(x); return n.length >= 3 && nt.startsWith(n) && nt.length - n.length <= 2 && /^[でをにがはとの]+$/.test(nt.slice(n.length)); });
    if (tag) item.t = tag;
  }
  // 説明文の後ろのほうに「TVアニメ『〇〇』オープニングテーマ」とある YouTube の本家はアニソン
  if (video.animeDesc) {
    item.animeDesc = 1;
    if (video.src === "youtube" && item.kind === "本家" && (item.g === "J-POP" || item.g === "その他")) item.g = "アニソン";
  }
  // ディズニー公式チャンネルの映画の曲（「(From『アナと雪の女王』)」など）はアニソン
  if (video.src === "youtube" && item.kind === "本家" && /disney/i.test(video.uploader || "") && /From\s*[『「]|アナと雪の女王/i.test(video.title)) item.g = "アニソン";
  // 説明文の最初に「〇〇書き下ろし楽曲のセルフカバーです」とある YouTube の動画（ゲームなどに提供した曲を作者本人が歌ったもの）。
  // 原曲（ゲーム内のボカロ版）は取り込まず、この動画を本家のままにして「セルフカバー」の印だけ付ける。歌っているのは本人なので歌声は外す
  if (video.src === "youtube" && item.kind === "本家" && /(書き下ろし|提供)\S{0,8}セルフカバー|セルフカバーです/.test((video.desc || video.descHead || "").slice(0, 300)) && !ORIGINAL_RE.test(video.title)) {
    item.selfDesc = 1; delete item.v;
  }
  return item;
}

// 歌ってみたを、同じ曲名の本家にひもづける（いちばん古い本家を原曲とみなす）
// YouTubeのチャンネル名からアーティスト名を取り出す（「YOASOBI - Topic」「〇〇 Official YouTube Channel」など）
// 歌い手のチャンネル名から名前だけを取り出す：「ころんの実況【すとぷり】」→「ころん」、「成人男性三人組 Official」→「成人男性三人組」
export function singerCore(name) {
  const c = cleanChannel(name);
  return cleanChannel(c.replace(/【[^】]*】|\[[^\]]*\]|［[^］]*］/g, "").replace(/の(ゲーム)?(実況|チャンネル|歌|うた)$/, "").trim()) || c;
}

export function cleanChannel(name) {
  name = name || "";
  return name.replace(/\s*[|｜].*$/, "").replace(/\s+-[^-]+-\s*$/, "").replace(/\s+-\s+[A-Za-z][A-Za-z .]*-?\s*$/, "")
    .replace(/\s*(ch\.?|channel)\s*$/i, "").replace(/\s*-\s*Topic$/i, "").replace(/\s*(official\s*)?(youtube\s*)?(channel|チャンネル)$/i, "")
    .replace(/\s*(official|公式)$/i, "").replace(/\s*(archives?|アーカイブ|切り抜き|clips?)$/i, "").replace(/\s*\/\s*.*$/, "").trim();
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
// 原曲が見つかっていない歌ってみたは、同じ曲名どうしでジャンルをそろえる。
// どれか1つでもアニメ・ゲームの曲の手がかり（「アニソン」タグ、「血界戦線ED」のようなタイトル）があればアニソン
const animeHint = c => animeOrGame(c.title || "", c.tags || []);
export function alignCoverGenres(items) {
  // 「シュガーソングとビターステップ」と「シュガーソングとビターステップ まるぐり」のように、後ろに余計な語が付いたものも同じ曲とみなす
  const covers = items.filter(c => c.kind === "歌ってみた" && !c.of && c.t && normalize(c.t).length >= 2);
  const keys = [...new Set(covers.map(c => normalize(c.t)))].sort((a, b) => a.length - b.length);
  const groups = new Map();
  for (const c of covers) {
    const n = normalize(c.t);
    const k = keys.find(k => k === n || (k.length >= 4 && n.startsWith(k))) || n;
    (groups.get(k) || groups.set(k, []).get(k)).push(c);
  }
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    // 曲名の後ろに余計な語が付いているもの（「シュガーソングとビターステップ まるぐり」）は、短いほうの曲名にそろえる
    const base = list.find(c => normalize(c.t) === k);
    if (base) for (const c of list) c.t = base.t;
    if (list.some(animeHint)) for (const c of list) c.g = "アニソン";
  }
}

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
// ニコニコにボカロの本家がある作者（ボカロP）の YouTube の本家は、タイトルや説明文に歌声名がなくてもボカロとみなす
export function vocaloByCreator(items) {
  const ps = new Set(items.filter(i => i.src === "niconico" && i.kind === "本家" && i.g === "ボカロ" && i.p).map(i => normalize(i.p)).filter(n => n.length >= 2));
  // ただし、そのYouTubeチャンネルに歌声（初音ミクなど）が分かる本家が1曲もないときはしない
  // （ニコニコで誰かが「Eve の曲 / 初音ミク」のように投稿したせいで、YOASOBI や Eve の公式チャンネルの曲がボカロになるのを防ぐ）
  //  （チャンネルの本家のうち3割以上で歌声が分かるときだけ。キタニタツヤや HoneyWorks のように、ボカロ曲もたまに出す公式チャンネルは除く）
  const chTally = new Map();
  for (const i of items) if (i.src === "youtube" && i.kind === "本家" && i.uploaderId) { const t = chTally.get(i.uploaderId) || [0, 0]; t[1]++; if (i.v) t[0]++; chTally.set(i.uploaderId, t); }
  const vocaloCh = new Set([...chTally].filter(([, t]) => t[0] >= 1 && t[0] / t[1] >= 0.3).map(([id]) => id));
  for (const i of items) if (i.src === "youtube" && i.kind === "本家" && (i.g === "J-POP" || i.g === "その他") && i.p && ps.has(normalize(i.p)) && vocaloCh.has(i.uploaderId) && !HUMAN_VO_RE.test(i.title || "")) i.g = "ボカロ";
}

const HUMAN_VO_RE = /[（(]\s*CV\s*[：:]|[（(]\s*Vo\s*[：:.]/i;
export function guessChannelGenre(items) {
  const tally = new Map();
  for (const i of items) if (i.src === "youtube" && i.kind === "本家" && i.uploaderId) {
    const t = tally.get(i.uploaderId) || { v: 0, n: 0 };
    t.n++; if (i.g === "ボカロ") t.v++;
    tally.set(i.uploaderId, t);
  }
  for (const i of items) {
    const t = tally.get(i.uploaderId);
    // 「feat. ちゅーたん（CV：早見沙織）」のように声優・人が歌っている曲は除く
    if (i.src === "youtube" && i.kind === "本家" && i.g === "J-POP" && t && t.v >= 1 && t.v / t.n >= 0.5 && !HUMAN_VO_RE.test(i.title || "")) i.g = "ボカロ";
  }
}

// セルフカバー（作曲した本人が歌った歌ってみた）に印をつける。
// タイトルに「self cover」「セルフカバー」「自分で歌ってみた」とある、または原曲と同じ投稿者（チャンネル）が投稿したもの。
// （歌い手名と作者名が同じ、は読み取りまちがいのことが多いので使わない）
const SELF_RE = /self[\s-]*cover|セルフ\s*カ[バヴ]ー|自分で歌ってみ|本人が歌ってみ|作者が歌ってみ/i;
export function markSelfCovers(items) {
  const byId = new Map(items.map(i => [i.id, i]));
  for (const c of items) {
    delete c.self;
    if (c.selfDesc) { c.self = 1; continue; }   // 提供曲を作者本人が歌った本家（悔やむと書いてミライ など）
    if (c.kind !== "歌ってみた") continue;
    const o = c.of ? byId.get(c.of) : null;
    const sameUploader = o && c.uploaderId && c.uploaderId === o.uploaderId && c.src === o.src;
    if (SELF_RE.test(c.title || "") || sameUploader || c.selfCover) c.self = 1;
  }
}

// YouTube とニコニコの両方に投稿された同じ曲（作者と曲名が同じ本家）を1曲にまとめる。
// 一番古い投稿を代表にして、もう片方には dup（代表のID）を付ける。サイトには代表だけを出し、もう片方は alt として持たせる。
// Remix・ver.・アレンジなどの別バージョンはまとめない。同じサイトどうし（再投稿など）もまとめない
const VERSION_RE = /remix|リミックス|\bver\b|ver\.|version|バージョン|アレンジ|arrange|short|ショート|full|フル|instrumental|inst\b|off ?vocal|self ?cover|セルフカバー|リメイク|remake|再投稿|piano|ピアノ|acoustic|アコースティック|live|ライブ|mv2|edit\b/i;
// 「ニコニコ動画より作者様の許諾を得て転載」のような、ほかの人のチャンネルに転載された動画
const SUB_RE = /[\s　]*[\[［【(（]?\s*(中文字幕|中字|繁中字幕|简中字幕|中文翻譯|English\s*sub(title)?s?|Eng\s*sub|\bsubbed\b|한글\s*자막|한국어\s*자막)\s*[\]］】)）]?/gi;
const REPRINT_RE = /許諾を得て転載|転載(させて|して(い|お)ります|しています|許可)|reprint(s|ed)? from|permission (was |has been )?(obtained|granted|given)/i;

const SHORT_VER_RE = /short\s*ver|ショート\s*ver|ショートバージョン|short\s*version|tv\s*size|tvサイズ|テレビサイズ|アニメ[^\s]*[』」]\s*ver\.?/i;   // 「TVアニメ『忘却バッテリー』Ver.」のようなタイアップ版MVも同じ曲として隠す
export function mergeSources(items) {
  for (const i of items) { delete i.dup; delete i.alt; delete i.selfCover; }
  // YouTube の本家で、説明文にニコニコ版へのリンクがある（または転載と書いてある）ものは、
  // 同じ曲名のニコニコの本家と同じ作者にそろえて、1曲にまとめられるようにする（転載チャンネル名を作者にしない）
  const nicoByT = new Map();
  for (const i of items) if (i.src === "niconico" && i.kind === "本家" && i.p && normalize(i.t)) {
    const k = normalize(i.t); if (!nicoByT.has(k) || (i.views || 0) > (nicoByT.get(k).views || 0)) nicoByT.set(k, i);
  }
  const byId = new Map(items.map(i => [i.id, i]));
  // ニコニコにない曲の転載は、YouTube にある本人の投稿（転載ではない、いちばん古いもの）に合わせる
  const ytByT = new Map();
  for (const i of [...items].sort((a, b) => (a.date || "").localeCompare(b.date || ""))) if (i.src === "youtube" && i.kind === "本家" && !i.reprint && i.p && normalize(i.t) && !ytByT.has(normalize(i.t))) ytByT.set(normalize(i.t), i);
  for (const i of items) {
    if (i.src !== "youtube" || i.kind !== "本家" || !(i.nicoSrc || i.reprint || !i.p)) continue;
    const linked = i.nicoSrc && byId.get(i.nicoSrc);
    // 作者が分からない YouTube の本家は、同じ曲名のニコニコの本家の作者に合わせる
    const target = linked && linked.kind === "本家" && normalize(linked.t) === normalize(i.t) ? linked : i.reprint ? (nicoByT.get(normalize(i.t)) || ytByT.get(normalize(i.t))) : !i.p ? nicoByT.get(normalize(i.t)) : null;
    if (!target?.p) continue;
    // 作者名はどちらかを選んで両方にそろえる。YouTube 側の作者名がタイトルに書いてあり、ニコニコ側はタイトルにない
    // （タグなどから推測した）ときは YouTube 側を信じる。それ以外（転載チャンネルの名前など）はニコニコ側
    const inTitle = (x, title) => normalize(x).length >= 2 && normalize(title || "").includes(normalize(x));
    const ytOk = !i.reprint && i.p && !/オリジナル|ボカロ|vocaloid|\bPV\b/i.test(i.p) && !isVoice(i.p) && inTitle(i.p, i.title) && (!inTitle(target.p, target.title) || (normalize(target.p) !== normalize(i.p) && normalize(target.p).includes(normalize(i.p))));
    if (ytOk) target.p = i.p; else i.p = target.p;
    i.a = target.a;
    if (!i.v && target.v) i.v = target.v;
    i.reprintOf = target.id;
  }
  // 「〇〇 - Topic」の自動生成音源（作者名がローマ字のことが多い）は、同じ曲名の公式動画があればその作者にそろえて、公式動画の中に隠す
  const officialByT = new Map();
  for (const i of items) if (i.src === "youtube" && i.kind === "本家" && i.p && !/ - Topic$/.test(i.uploader || "") && normalize(i.t) && !officialByT.has(normalize(i.t))) officialByT.set(normalize(i.t), i);
  for (const i of items) {
    if (i.src !== "youtube" || i.kind !== "本家" || !/ - Topic$/.test(i.uploader || "")) continue;
    const o = officialByT.get(normalize(i.t));
    const artist = normalize(i.uploader.replace(/ - Topic$/, ""));
    if (o && (normalize(o.p).includes(artist) || artist.includes(normalize(o.p)) || normalize(o.uploader || "").includes(artist) || normalize(i.p) === normalize(o.p))) { i.p = o.p; i.a = o.a; }
  }
  const voiceCh = new Set(items.filter(i => i.src === "youtube" && i.v && i.uploaderId).map(i => i.uploaderId));
  const groups = new Map();
  for (const i of items) {
    // 「ショートVer.」「TVサイズ」は同じ曲として、フルの動画の中に隠す（ほかの別バージョンは別の曲のまま）
    if (i.kind !== "本家" || i.topicHidden || !i.p || !i.t || (VERSION_RE.test(i.title || "") && !i.rm && !SHORT_VER_RE.test(i.title || ""))) continue;
    const k = normalize(i.t) + "|" + normalize(i.p) + (i.rm ? "|" + i.rm : "");
    if (!normalize(i.t) || !normalize(i.p)) continue;
    (groups.get(k) || groups.set(k, []).get(k)).push(i);
  }
  const dupOf = new Map();
  for (let list of groups.values()) {
    if (list.length < 2) continue;
    // ニコニコの歌声つきの本家が先に投稿されていて、YouTube 側があとから出た本人の歌うMV（歌声の曲がないチャンネル）なら、
    // ニコニコ版がボカロの原曲で、YouTube 版は本人のセルフカバー（Eve の「ドラマツルギー」など）
    const nicoV = list.find(r => r.src === "niconico" && r.v);
    const selfYT = nicoV ? list.filter(r => r.src === "youtube" && !r.v && (r.g === "J-POP" || r.g === "アニソン") && !voiceCh.has(r.uploaderId)) : [];
    //  （同じ日の公開でどちらが先か分からないことがあるので、YouTube 版が1日以上先に出ていなければ、ニコニコ版を原曲にする）
    if (selfYT.length && selfYT.every(h => (Date.parse(h.date) || 0) > (Date.parse(nicoV.date) || 0) - 864e5)) {
      for (const h of selfYT) { h.kind = "歌ってみた"; h.of = nicoV.id; h.by = h.p; h.selfCover = 1; dupOf.set(h.id, nicoV.id); }
      list = list.filter(r => !selfYT.includes(r));
      if (list.length < 2) continue;
    }
    // サイトごとに一番再生されている投稿を1つずつ選ぶ。同じサイトの残り（Official Audio・Lyric Video・ダンス版など同じ曲の別の動画）は、
    // 別の曲として並べずに代表の曲の中に隠す（再生数は合計に足す）
    const best = new Map();
    // 作者本人の投稿を転載より優先する（どちらも同じなら再生数の多いほう）
    const rank = i => (i.reprint ? 0 : 1e12) + (i.ne ? 0 : 5e11) + (SHORT_VER_RE.test(i.title || "") ? 0 : 2e11) + (i.views || 0);   // 転載より本人、埋め込めない動画より埋め込める動画
    for (const i of list) { const b = best.get(i.src); if (!b || rank(i) > rank(b)) best.set(i.src, i); }
    const picked = [...best.values()].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.src === "niconico" ? -1 : 1));
    const [main, ...rest] = picked;
    main.alt = rest.map(r => r.id);
    // どちらかのサイトでボカロと分かっていればボカロ。歌声も分かっているほうから
    // ただし YouTube 側が歌声の分からない J-POP・アニソンのMV（作者本人が歌っている）なら、そちらに合わせる
    //（Eve の「ドラマツルギー」のように、ニコニコ側のタイトルにだけ「初音ミク」とある場合）
    //  （そのYouTubeチャンネルに歌声の分かる曲が1曲もないときだけ。みきとP の「ロキ」のようなボカロPのチャンネルは除く）
    const human = picked.find(r => r.src === "youtube" && !r.v && (r.g === "J-POP" || r.g === "アニソン") && !voiceCh.has(r.uploaderId));
    if (human) { main.g = human.g; delete main.v; }
    else {
      if (picked.some(r => r.g === "ボカロ")) main.g = "ボカロ";
      if (!main.v) main.v = picked.find(r => r.v)?.v;
    }
    for (const r of rest) { r.dup = main.id; dupOf.set(r.id, main.id); }
    for (const r of list) if (!r.dup && r !== main) { r.dup = main.id; dupOf.set(r.id, main.id); }
    if (!main.alt.length) delete main.alt;
  }
  // まとめた側に紐づいていた歌ってみたは、代表の曲に付け替える
  for (const c of items) if (c.of && dupOf.has(c.of)) c.of = dupOf.get(c.of);
  return items;
}

// 同じ人の作者名の表記ゆれを、本人の名乗り（X などの表記）にそろえる
const CREATOR_NAMES = { "黒うさP": "黒うさP/WhiteFlame", "WhiteFlame": "黒うさP/WhiteFlame", "kemu": "KEMU VOXX", "ALEXANDROS": "[Alexandros]", "DISH": "DISH//", "40meterP": "40mP", "Mitchie_M": "Mitchie M" };
const fixCreatorNames = items => { for (const i of items) if (i.p && CREATOR_NAMES[i.p]) i.p = CREATOR_NAMES[i.p]; };

// 「恋愛裁判 Love Trial」「トリノコシティ Torinoko City」のように曲名のうしろに英語名が付いていて、
// 日本語の部分だけの曲名がサイトにほかにもあるときは、日本語の部分を曲名にする（ローマ字・英訳はそろえない）
const EN_TAIL_RE = /^(.*[^\x00-\x7F])[\s　]+([A-Za-z][A-Za-z'’.,!?&-]*(?:\s+[A-Za-z'’.,!?&-]+)*)$/;
function dropEnglishTail(items) {
  const known = new Set(items.map(i => normalize(i.t || "")).filter(Boolean));
  for (const i of items) {
    if (i.ofLocked && i.kind !== "本家") continue;
    const m = (i.t || "").match(EN_TAIL_RE);
    if (m && normalize(m[1]).length >= 2 && known.has(normalize(m[1]))) i.t = m[1].trim();
  }
}

// 作者本人が昔の曲をアレンジして出し直したもの（「ドーナツホール 2024」「アンチクロロベンゼン ver.2025」「〇〇 リメイク」など）。
// 元の曲とは別の曲のまま、曲名は元の曲にそろえて rm（元の曲のID）と rv（「2024」など）を付ける
const REMAKE_RE = /(?:19|20)\d\d\s*(?:ver|version|バージョン)|(?:ver|version)\.?\s*(?:19|20)\d\d|リメイク|remake|再録|re-?arrange|リアレンジ|re-?recording/i;
const REMAKE_TAIL_RE = /[\s　]*[-~～(（\[［]*\s*(?:(?:19|20)\d\d\s*(?:ver(?:sion)?\.?)?|ver(?:sion)?\.?\s*(?:19|20)\d\d|remake|リメイク|re-?arrange|リアレンジ|再録|re-?recording)\s*[-~～)）\]］]*\.?$/i;
function markRemakes(items) {
  for (const i of items) { delete i.rm; delete i.rv; }
  const byT = new Map();
  for (const i of items) if (i.kind === "本家" && normalize(i.t)) (byT.get(normalize(i.t)) || byT.set(normalize(i.t), []).get(normalize(i.t))).push(i);
  for (const i of items) {
    if (i.kind !== "本家" || !i.t) continue;
    const yearTail = /[\s　](?:19|20)\d\d$/.test(i.t);
    if (!REMAKE_RE.test(i.title || "") && !yearTail) continue;
    const base = i.t.replace(REMAKE_TAIL_RE, "").trim() || i.t;
    const cands = (byT.get(normalize(base)) || []).filter(o => o !== i && !REMAKE_RE.test(o.title || "") && (o.date || "") < (i.date || "") &&
      (normalize(o.p || "") === normalize(i.p || "") || (o.a && o.a === i.a) || (normalize(o.p || "").length >= 2 && normalize(i.title || "").includes(normalize(o.p)))));
    if (!cands.length) continue;
    const o = cands.sort((a, b) => (a.date || "").localeCompare(b.date || ""))[0];
    const y = (i.title || "").match(/(?:19|20)\d\d/);
    i.t = o.t; i.rm = o.id; i.rv = y ? y[0] : "リメイク"; i.p = o.p; i.a = o.a;
  }
}

// 「〇〇 - Topic」の自動生成音源（埋め込みで再生できず、曲名もローマ字のことが多い）は、そのアーティストの公式チャンネルの曲がサイトにあれば出さない
// （同じ曲の公式動画は毎日の Topic の差しかえ・公式チャンネルの取り込みで入る）
// Topic チャンネルのローマ字のアーティスト名 → 公式チャンネル名
const TOPIC_ALIAS = { "yorushika": "ヨルシカ", "masayoshioishi": "オーイシマサヨシ", "96neko": "96猫", "chotokkyu": "超特急", "yuuri": "優里" };
function hideTopicWithOfficial(items) {
  const chNames = new Set();
  for (const i of items) if (i.src === "youtube" && i.kind === "本家" && i.uploader && !/ - Topic$/.test(i.uploader)) chNames.add(normalize(i.uploader));
  const names = [...chNames];
  for (const i of items) {
    delete i.topicHidden;
    if (i.src !== "youtube" || i.kind !== "本家" || !/ - Topic$/.test(i.uploader || "")) continue;
    const artist = normalize(i.uploader.replace(/ - Topic$/, ""));
    const alias = normalize(TOPIC_ALIAS[artist] || "");
    if ((artist.length >= 3 && names.some(n => n.includes(artist))) || (alias && names.some(n => n.includes(alias)))) i.topicHidden = 1;
  }
}

// 歌ってみたの歌い手名を直す
// ・YouTubeのチャンネル名が英語で、歌い手名まで英語になったもの（「Suisei Channel」→ 星街すいせい）は対応表で
// ・タイトルの「曲名 / 原曲の作者【歌い手】」の形で、歌い手が原曲の作者になったものは、タイトルの最後の【名前】か先頭の「名前 - 」で（セルフカバーは除く）
const SINGER_NAMES = { "Meychan": "めいちゃん", "96NEKO": "96猫", "Suisei": "星街すいせい", "Kuzuha": "葛葉", "Chogakusei": "超学生", "Itsuki Natsume": "棗いつき" };
// タイトルの中の歌い手名（「ver.aoru」「【サンヌ cover】」「cover by X」「/ そらびび(cover)」、最後の【X】、最初の【X】の順に探す）
const BAD_SINGER = /歌ってみた|うたってみた|みた|歌って|踊って|cover|カバー|オリジナル|^MV$|feat|配布|Synthesizer|SynthV|VOCALOID|NEUTRINO|CeVIO|UTAU|VOICEVOX|フル|full|ショート|弾き語り|リレー|メドレー|ミックス|MIX|作業用|歌踊|歌コレ|\d{4}|で$|[をにし]\S*て$|って$/i;
function singerInTitle(title = "", t = "", strongOnly = false) {
  const strong = [/ver\.?\s*([^\s【】\[\]()（）]+)\s*$/i, /by\s*([^\s【】\[\]()（）]+)\s*(?:中文字幕|字幕)?\s*$/i, /cover(?:ed)?\s*by\s*([^【】\[\]()（）|｜]+?)\s*(?:[【\[(（|｜]|$)/i, /【([^】]+?)\s+cover\.?】/i,
    /[\/／]\s*([^\/／【】()（）]+?)\s*[（(]\s*cover\s*[)）]/i];
  const pats = strongOnly ? strong : [...strong, /【([^】]+)】\s*$/, /^【([^】]+)】/];
  for (const re of pats) {
    const x = title.match(re)?.[1]?.trim().replace(/^ver\.?\s*/i, "");
    if (x && x.length >= 2 && !BAD_SINGER.test(x) && !isVoice(x) && normalize(x) !== normalize(t)) return x;
  }
  return null;
}
function fixCoverSingers(items) {
  const byId = new Map(items.map(i => [i.id, i]));
  for (const c of items) {
    if (c.kind !== "歌ってみた" || c.byFixed) continue;
    // 歌い手名がない・曲名になっている・「Co」のように切れている・チャンネル名でタイトルの名前より長い（「そらびびの秘密基地」）ときは、タイトルの中の名前に
    if (c.by && /^ver\.?\s*/i.test(c.by)) c.by = c.by.replace(/^ver\.?\s*/i, "");
    if (c.by && BAD_SINGER.test(c.by) && !/^[\p{L}\p{N}._-]+$/u.test(c.by.replace(/[×＆&、 ]/g, "")) === false && /で$|[をにし]\S*て$|って$|歌って|踊って|みた/.test(c.by)) c.by = "";   // 「英語で」「超会議をかけて」は歌い手名ではない
    { const o0 = c.of && byId.get(c.of);
      // 歌い手名が曲名・「Co」になっているときは、タイトルの【】の名前まで使う。名前がない・チャンネル名のときは「ver.X」「cover by X」などの形だけ
      const wrong = c.by && (normalize(c.by) === normalize(c.t) || (o0 && normalize(c.by) === normalize(o0.t)) || /^co(ver)?\.?$/i.test(c.by));
      const strong = singerInTitle(c.title, c.t, true);
      if (wrong) { const x = singerInTitle(c.title, c.t); if (x && (!o0 || normalize(x) !== normalize(o0.t))) c.by = x; }
      else if (strong && (!c.by || (c.src === "youtube" && normalize(c.by) !== normalize(strong) && normalize(c.by).startsWith(normalize(strong))))) c.by = strong; }
    if (!c.by) continue;
    if (SINGER_NAMES[c.by]) { c.by = SINGER_NAMES[c.by]; continue; }
    const o = c.of && byId.get(c.of);
    if (!o?.p || c.self || normalize(c.by) !== normalize(o.p)) continue;
    const tail = (c.title.match(/【([^】]+)】\s*$/) || [])[1];
    const head = (c.title.match(/^([^-－「『【]+?)\s+[-－]\s+/) || [])[1];
    const x = [tail, head].find(x => x && !/歌ってみた|cover|カバー|オリジナル|MV|ver|feat|配布|Synthesizer|ボカロ|VOCALOID|NEUTRINO|CeVIO|UTAU|VOICEVOX|AI/i.test(x) && !isVoice(x) && normalize(x) !== normalize(o.p) && normalize(x) !== normalize(o.t));
    if (x) c.by = x.trim();
  }
}

// raw の中に sub が「ひとつの言葉として」入っているか（前後が文字・数字で続いていない。後ろが「歌ってみた」「cover」などなら続いていてもよい）
// 見つからないときは null（記号の違いなどで比べられない）
const COVER_TAIL = /^(を|歌ってみた|うたってみた|歌わせて|歌いました|うたいました|cover|カバー|ver|feat|弾き語り)/i;
function asToken(raw, sub) {
  const R = String(raw || "").normalize("NFKC").toLowerCase(), S = String(sub || "").normalize("NFKC").toLowerCase();
  const i = R.indexOf(S);
  if (!S || i < 0) return null;
  const word = /[\p{L}\p{N}]/u, rest = R.slice(i + S.length);
  const lat = ch => /[a-z0-9]/.test(ch);   // 英字と日本語の切りかわり（「あぶくBubble」）は言葉の切れ目とみなす
  const joined = (a, b) => word.test(a) && word.test(b) && lat(a) === lat(b);
  return !(i > 0 && joined(R[i - 1], S[0])) && !(rest && joined(S[S.length - 1], rest[0]) && !COVER_TAIL.test(rest));
}

let CREATOR_SET = new Set();
export function linkCovers(items) {
  CREATOR_SET = new Set(items.filter(i => i.kind === "本家" && i.p).map(i => normalize(i.p)));
  dropEnglishTail(items);
  inferNamesFromTags(items);
  guessChannelGenre(items);
  fillCreators(items);
  fixCreatorNames(items);
  markRemakes(items);
  vocaloByCreator(items);
  hideTopicWithOfficial(items);
  // 原曲を決めてある歌ってみた（リクエスト・投稿ネタ）の原曲が、隠したTopicの音源なら、同じ曲名の公式の動画につなぎかえる
  {
    const byId = new Map(items.map(i => [i.id, i]));
    const official = new Map(items.filter(i => i.kind === "本家" && !i.topicHidden && i.src === "youtube").map(i => [normalize(i.t), i]));
    for (const c of items) {
      const o = c.ofLocked && byId.get(c.of);
      const to = o?.topicHidden && official.get(normalize(o.t));
      if (to) c.of = to.id;
    }
    // 自動で集めた歌ってみた（投稿ネタ・リクエスト）でも、原曲より30日以上前の投稿は別の曲なのでつながない
    for (const c of items) {
      const o = c.ofLocked && c.req && !c.byFixed && byId.get(c.of);
      if (o && ((Date.parse(o.date) || 0) - (Date.parse(c.date) || 0)) / 864e5 > 30 && normalize(c.t) !== normalize(o.t)) { delete c.of; delete c.ofLocked; delete c.req; }
    }
  }
  const originals = new Map();
  for (const i of items.filter(x => x.kind === "本家" && !x.topicHidden).sort((a, b) => (a.date || "").localeCompare(b.date || ""))) {
    const k = normalize(i.t);
    if (k && !isVoice(i.t) && !originals.has(k)) originals.set(k, i);   // 曲名が「KAITO」「重音テトSV」のような歌声名のものは原曲の候補にしない
  }
  for (const c of items) {
    if (c.kind !== "歌ってみた" || c.ofLocked) continue;
    const t0 = c.t;   // 原曲さがしの前の曲名（つながなかったときに戻す）
    let o = originals.get(normalize(c.t));
    // 曲名が読み取れなくても、ニコニコの歌ってみたにはたいてい曲名のタグが付いているので、タグから原曲を探す
    if (!o) for (const t of c.tags || []) {
      if (isVoice(t) || hasTag([t], VOCALO_TAGS)) continue;   // 「初音ミク」「VOCALOID」のようなタグは曲名ではない
      const hit = originals.get(normalize(t));
      if (hit && normalize(t).length >= 2 && normalize(c.title).includes(normalize(t))) { o = hit; c.t = hit.t; break; }
    }
    // 曲名の頭が原曲の曲名と同じ（「マトリョシカ vip店長」のように歌い手名が続いている）ときも原曲とみなす
    if (!o) {
      // 先頭の「歌ってみた」「cover」は外して比べる（「【】歌ってみた KING 葛葉 【】」のように曲名の前に来ているもの）
      const n = normalize(c.t).replace(/^(歌ってみた|うたってみた|歌わせていただきました|cover|カバー)+/, "");
      // 「Dear」と「Dearest」のように、英単語の途中で切れる一致は使わない
      for (let k = n.length - 1; k >= 3 && !o; k--) {
        if (/[a-z0-9]/.test(n[k - 1]) && /[a-z0-9]/.test(n[k])) continue;
        const hit = originals.get(n.slice(0, k)); if (hit && asToken(c.t, hit.t) !== false) { o = hit; c.t = hit.t; }   // 「アイロニックメタファー」を「アイロニック」にしない
      }
    }
    // 原曲より前に投稿された「歌ってみた」は、その曲の歌ってみたではない（同じ名前・似た名前の別の曲）。
    // 曲名が完全に同じでないときは30日以上前、ボカロの原曲（投稿日＝発表日）は完全に同じでも60日以上前ならつながない
    // （J-POP・アニソンは、昔の曲の公式MVがあとからYouTubeに上がることがあるので、曲名が同じなら日付では外さない）
    if (o) {
      const early = ((Date.parse(o.date) || 0) - (Date.parse(c.date) || 0)) / 864e5;
      const exact = normalize(t0) === normalize(o.t);
      if ((!exact && early > 30) || (o.g === "ボカロ" && early > 60)) { c.t = t0; o = null; }
    }
    if (o) { c.of = o.id; c.p = o.p || c.p; c.a = o.p ? o.a : (c.a || o.a); if (o.g !== "その他") c.g = o.g; else if (c.g === "その他") c.g = o.g; }
    // 原曲が見つからない歌ってみたで、曲名に余計な言葉がついているもの（「VOCALOIDでニコニコ動画流星群」「ニコニコ動画流星群を漢らしく」）は、
    // 曲名の中に入っているタグ（ニコニコの曲名タグ）のうち一番長いものにそろえる（原曲さがしもその曲名で探せるように）
    else if (c.src === "niconico" && c.tags?.length) {   // YouTube のタグはばらばらなので使わない
      const nt = normalize(c.t);
      const who = [c.by, c.p, c.uploader].filter(Boolean).map(normalize);
      // タグの前は何もないか「〜で」「〜ので」だけ、後ろは何もないか「を歌ってみた」「@歌い手」「-Arrange」などのときだけ（「松任谷由実 春よ、来い」の作者名タグは使わない）
      const R = c.t.normalize("NFKC").toLowerCase();
      const NOISE_AFTER = /^\s*($|を|歌|うた|@|＠|のは|[-－–]|\(|（|\[|【|ver|arrange|acoustic|rap|cover|full|edition|✽|・|、)/i;
      const fits = t => { const S = t.replace(/_/g, " ").normalize("NFKC").toLowerCase(), i = R.indexOf(S);
        return i >= 0 && (i === 0 || /(で|ので|が)\s*$/.test(R.slice(0, i))) && NOISE_AFTER.test(R.slice(i + S.length)); };
      const tag = c.tags.filter(t => !isVoice(t) && !hasTag([t], VOCALO_TAGS) && !/歌ってみた|カバー|cover|音楽|VOCALOID|合唱|メドレー|演奏|弾いて|ランキング|部門|コラボ|歌コレ|\d{4}/i.test(t) && !who.includes(normalize(t)) && !CREATOR_SET.has(normalize(t)) && normalize(t).length >= 4 && normalize(t.replace(/_/g, " ")) !== nt && fits(t))
        .sort((a, b) => b.length - a.length)[0];
      // 大文字・小文字はタイトルの書き方のまま（タグは「shadow_shadow」のように小文字のことがある）
      const pickT = t => { const N = c.t.normalize("NFKC"), S = t.replace(/_/g, " ").normalize("NFKC"), i = N.toLowerCase().indexOf(S.toLowerCase()); return i >= 0 ? N.slice(i, i + S.length) : S; };
      if (tag) c.t = pickT(tag);
    }
  }
  // 「歌ってみた」タグが付いていても、原曲（オリジナル曲）の作者本人がもう片方のサイトに出した同じ曲は本家（あとで1曲にまとめる）
  const byIdLC = new Map(items.map(i => [i.id, i]));
  for (const c of items) {
    const o = c.kind === "歌ってみた" && c.of ? byIdLC.get(c.of) : null;
    if (!o || o.src === c.src || !ORIGINAL_RE.test(o.title || "") || VERSION_RE.test(c.title || "")) continue;
    if (!c.by || normalize(c.by) !== normalize(o.p || "")) continue;
    c.kind = "本家"; c.p = o.p; c.a = o.a; c.g = o.g; delete c.of; delete c.by; delete c.self;
  }
  mergeSources(items);
  // まとめたことで原曲のジャンルが変わった（YouTube版がニコニコ版に合わせてボカロになった など）ら、歌ってみたにも反映
  { const byIdM = new Map(items.map(i => [i.id, i])); for (const c of items) { const o = c.of && byIdM.get(c.of); if (o && c.kind === "歌ってみた" && o.g !== "その他") c.g = o.g; } }
  markSelfCovers(items);
  fixCoverSingers(items);
  // 原曲につながった歌ってみたで、曲名に余計な言葉が残っているもの（「歌ってみた KING 葛葉」）は原曲の曲名にそろえる
  { const byIdT = new Map(items.map(i => [i.id, i]));
    for (const c of items) { const o = c.kind === "歌ってみた" && c.of && byIdT.get(c.of);
      if (!o || normalize(o.t).length < 2 || normalize(c.t) === normalize(o.t) || !asToken(c.t, o.t)) continue;
      // 曲名のほかに残っているのが「歌ってみた」などの言葉・歌い手名・原曲の作者名・記号だけのときだけ
      const S = o.t.normalize("NFKC").toLowerCase(), R = c.t.normalize("NFKC").toLowerCase();
      const rest = normalize(R.replace(S, " ")).replace(/歌ってみた|うたってみた|歌わせていただきました|cover|カバー|tvedit|tvsize|fullver|ver/g, "");
      if (!rest || rest === normalize(c.by || "") || rest === normalize(o.p || "") || (c.by && rest.includes(normalize(c.by)))) c.t = o.t; } }
  guessCoverGenre(items);
  alignCoverGenres(items);
  // 管理人の手直し（overrides.json の g）は、自動の判定より優先する。原曲を手直ししたら、その歌ってみたも同じジャンルに
  const byIdF = new Map(items.map(i => [i.id, i]));
  for (const i of items) if (i.kind === "歌ってみた" && i.vr) i.g = "ボカロ";   // 歌声に歌わせたカバーはボカロ
  for (const i of items) if (i.gFixed) i.g = i.gFixed;
  for (const c of items) { const o = c.of && byIdF.get(c.of); if (o && o.gFixed && !c.gFixed) c.g = o.g; }
  // 同じ歌い手が同じ曲の歌ってみたをニコニコとYouTubeの両方に出しているときは、1件にまとめる（ニコニコ版を代表に、YouTube版は「ほかのサイト」に）
  { const groups = new Map();
    for (const c of items) if (c.kind === "歌ってみた" && c.of && !c.dup && normalize(c.by || "").length >= 2) {
      const k = c.of + "|" + normalize(c.by); (groups.get(k) || groups.set(k, []).get(k)).push(c); }
    for (const list of groups.values()) {
      const best = new Map();
      for (const c of list) { const b = best.get(c.src); if (!b || (c.views || 0) > (b.views || 0)) best.set(c.src, c); }
      if (best.size < 2) continue;
      const [main, ...rest] = [...best.values()].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.src === "niconico" ? -1 : 1));
      main.alt = rest.map(r => r.id);
      for (const r of rest) r.dup = main.id;
    }
  }
  fixCreatorNames(items);
  fixCreatorKeys(items);
  return items;
}

// 作者ページは投稿者（チャンネル）ごとにまとめているが、レコード会社などのチャンネルには別の作者の曲もある
// （DECO*27 の曲が多いチャンネルの「椎名もた - 少女A」など）。チャンネルでいちばん多い作者名とちがう曲は、
// ニコニコの同じ名前の作者、なければ名前でまとめる
function fixCreatorKeys(items) {
  const nicoA = new Map();
  for (const i of items) if (i.src === "niconico" && i.kind === "本家" && i.p && i.a && !nicoA.has(normalize(i.p))) nicoA.set(normalize(i.p), i.a);
  const byCh = new Map();
  for (const i of items) if (i.src === "youtube" && i.kind === "本家" && i.p && i.a && i.a.startsWith("youtube:")) {
    const m = byCh.get(i.a) || new Map(); m.set(normalize(i.p), (m.get(normalize(i.p)) || 0) + 1); byCh.set(i.a, m);
  }
  const main = new Map([...byCh].map(([a, m]) => [a, [...m].sort((x, y) => y[1] - x[1])[0][0]]));
  for (const i of items) {
    if (i.src !== "youtube" || i.kind !== "本家" || !i.p || !main.has(i.a)) continue;
    const top = main.get(i.a), me = normalize(i.p);
    if (!me || me === top || me.includes(top) || top.includes(me)) continue;
    i.a = nicoA.get(me) || "name:" + me;
  }
}

// サイト表示用：必要な項目だけにした軽いデータ
const unent = s => typeof s === "string" ? s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'") : s;
const KEEP = ["id", "src", "url", "title", "t", "kind", "g", "p", "v", "by", "of", "a", "date", "views", "thumb", "ne", "self", "rm", "rv", "vr"];
const ALT_KEEP = ["id", "src", "url", "views", "thumb", "ne", "date"];
// サイト用：まとめた曲（dup）は出さず、代表の曲に alt（もう片方のサイトの投稿）として持たせる。再生数は合計にする
export const toSite = items => {
  const byId = new Map(items.map(i => [i.id, i]));
  // alt にならなかった転載（同じサイトの2本目以降）：前のIDの票やページを代表の曲に寄せるため、IDだけ持たせる
  const hidden = new Map();
  for (const i of items) if (i.dup && !(byId.get(i.dup)?.alt || []).includes(i.id)) (hidden.get(i.dup) || hidden.set(i.dup, []).get(i.dup)).push(i);
  return items.filter(i => !i.dup && !i.topicHidden).map(i => {
    const o = Object.fromEntries(KEEP.filter(k => i[k] != null && i[k] !== "").map(k => [k, unent(i[k])]));
    const alts = (i.alt || []).map(id => byId.get(id)).filter(Boolean);
    if (alts.length) {
      o.alt = alts.map(a => Object.fromEntries(ALT_KEEP.filter(k => a[k] != null && a[k] !== "").map(k => [k, a[k]])));
      o.views = (i.views || 0) + alts.reduce((n, a) => n + (a.views || 0), 0);
    }
    const hid = hidden.get(i.id);
    if (hid) { o.al = hid.map(h => h.id); o.views = (o.views || 0) + hid.reduce((n, h) => n + (h.views || 0), 0); }
    return o;
  });
};

// 曲を決めて取り込んだ歌ってみた（リクエスト・投稿ネタ）で、歌い手が原曲の作者になってしまったとき（「CleeNoah - ラグトレイン / 稲葉曇【歌ってみた】」）に、
// タイトルの最後の【名前】や先頭の「名前 - 」、チャンネル名から歌い手を選び直す
export function fixReqSinger(by, title = "", uploader = "", origP = "") {
  if (!origP || !by || normalize(by) !== normalize(origP)) return by;
  const tail = (title.match(/【([^】]+)】\s*$/) || [])[1];
  const head = (title.match(/^([^-－「『【]+?)\s+[-－]\s+/) || [])[1];
  return [tail, head, singerCore(uploader || "")].find(x => x && !/歌ってみた|cover|カバー|オリジナル/i.test(x) && normalize(x) !== normalize(origP))?.trim() || "";
}
