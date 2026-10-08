// ネットにつながずに、保存済みのデータ（タイトルとタグ）を今の判定ルールで読み直す。
//   node scripts/reclassify.mjs
import { readFile, writeFile } from "node:fs/promises";
import { classify, linkCovers, toSite } from "./classify.mjs";

const path = p => new URL("../" + p, import.meta.url);
const items = JSON.parse(await readFile(path("data/songs.json"), "utf8"));
const overrides = JSON.parse(await readFile(path("data/overrides.json"), "utf8").catch(() => "{}"));

const out = items.map(old => {
  const fresh = classify({ ...old, uploaderId: (old.a || "").includes(":") ? old.a.split(":")[1] : undefined },
    { fallbackGenre: old.g === "その他" ? "その他" : old.g });
  const keep = { firstSeen: old.firstSeen, seed: old.seed };
  if (old.src === "youtube" && old.kind === "歌ってみた" && !old.v) fresh.kind = "歌ってみた";
  const merged = { ...fresh, ...keep };
  if (!merged.p && old.p && old.src === "youtube") merged.p = old.p;
  const o = overrides[merged.id];
  if (o) { Object.assign(merged, o); if ("of" in o) merged.ofLocked = true; }
  delete merged.of;
  return merged;
});
linkCovers(out);
await writeFile(path("data/songs.json"), JSON.stringify(out, null, 1) + "\n");
await writeFile(path("data/site.json"), JSON.stringify(toSite(out)) + "\n");
console.log(`読み直しました: ${out.length}件`);
