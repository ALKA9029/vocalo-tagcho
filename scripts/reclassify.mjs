// ネットにつながずに、保存済みのデータ（タイトルとタグ）を今の判定ルールで読み直す。
//   node scripts/reclassify.mjs
import { readFile, writeFile } from "node:fs/promises";
import { classify, linkCovers, toSite, isKaraoke, singerCore } from "./classify.mjs";

const path = p => new URL("../" + p, import.meta.url);
const items = JSON.parse(await readFile(path("data/songs.json"), "utf8")).filter(i => !isKaraoke(i.title));
const overrides = JSON.parse(await readFile(path("data/overrides.json"), "utf8").catch(() => "{}"));

const out = items.map(old => {
  const uploaderId = old.uploaderId ?? ((old.a || "").includes(":") ? old.a.split(":")[1] : undefined);
  const fresh = classify({ ...old, uploaderId },
    // YouTube はどの検索から来たか（ジャンルの手がかり）を保存していないので、前のジャンルを手がかりにする。
    // ニコニコはタグで判定できるので、前のジャンルは引き継がない（一度ボカロになると直らなくなるため）
    { fallbackGenre: old.src === "youtube" && old.g !== "その他" ? old.g : "その他" });
  const keep = { firstSeen: old.firstSeen, seed: old.seed, ...(old.nicoSrc && !fresh.nicoSrc ? { nicoSrc: old.nicoSrc } : {}) };
  // 「歌ってみた」チャンネルとして手動登録したチャンネルの動画は、タイトルに関係なく歌ってみたのまま
  if (old.chCover) { fresh.kind = "歌ってみた"; fresh.chCover = true; }
  // 曲ページからリクエストされた歌ってみたは、リクエストされた曲につないだまま
  if (old.req) { fresh.kind = "歌ってみた"; fresh.req = old.req; fresh.by ||= singerCore(old.uploader || "") || old.by; }
  const merged = { ...fresh, ...keep };
  if (!merged.p && old.p && old.src === "youtube") merged.p = old.p;
  const o = overrides[merged.id];
  if (o) { Object.assign(merged, o); if ("of" in o) merged.ofLocked = true; if ("g" in o) merged.gFixed = o.g; }
  delete merged.of;
  if (merged.req) { merged.of = merged.req; merged.ofLocked = true; }
  if (o && "of" in o) merged.of = o.of;   // 管理人が手で決めた原曲（overrides.json）
  return merged;
});
linkCovers(out);
await writeFile(path("data/songs.json"), JSON.stringify(out, null, 1) + "\n");
await writeFile(path("data/site.json"), JSON.stringify(toSite(out)) + "\n");
console.log(`読み直しました: ${out.length}件`);
