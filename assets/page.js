// 曲ページの「▶ ここで聴く」：YouTube／ニコニコ公式の埋め込みプレイヤーを画面下に出す（同時に1曲だけ）。
// プレイヤーは押したときに初めて読み込むので、ページを開いたときの重さは変わらない
(() => {
  const player = document.getElementById("player");
  if (!player) return;
  let current = null;

  function close() {
    player.replaceChildren();   // iframe を消すと再生も止まる
    player.hidden = true;
    document.body.classList.remove("has-player");
    if (current) current.forEach(b => b.classList.remove("playing"));
    current = null;
  }

  function play(btn) {
    const url = btn.dataset.embed;
    if (!url) return;
    if (current && current[0]?.dataset.embed === url) { close(); return; }
    close();
    current = [...document.querySelectorAll("[data-embed]")].filter(b => b.dataset.embed === url);
    current.forEach(b => b.classList.add("playing"));

    const head = document.createElement("div"); head.className = "ph";
    const a = document.createElement("a");
    a.href = btn.dataset.url; a.target = "_blank"; a.rel = "noopener";
    a.textContent = `${btn.dataset.title} ↗`; a.title = `${btn.dataset.src}で開く`;
    const x = document.createElement("button");
    x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "プレイヤーを閉じる");
    x.addEventListener("click", close);
    head.append(a, x);

    const f = document.createElement("iframe");
    f.src = url;
    f.title = `${btn.dataset.title}（${btn.dataset.src}のプレイヤー）`;
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    f.referrerPolicy = "strict-origin-when-cross-origin";

    player.replaceChildren(head, f);
    player.hidden = false;
    document.body.classList.add("has-player");
  }

  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-embed]");
    if (btn) { e.preventDefault(); play(btn); }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && current) close(); });
  // ニコニコは準備ができたら（loadComplete）こちらから「再生」を送る（autoplay だけでは始まらないことがあるため）
  window.addEventListener("message", e => {
    const f = player.querySelector("iframe");
    if (!f || e.source !== f.contentWindow || !/(^|\.)nicovideo\.jp$/.test(new URL(e.origin).hostname)) return;
    if (e.data && e.data.eventName === "loadComplete") e.source.postMessage({ sourceConnectorType: 1, playerId: "tagtune", eventName: "play" }, e.origin);
  });
})();

// 曲ページの「歌ってみたを教えてね」：URLを Supabase の cover_requests に送る。毎朝の更新で確認して、歌ってみたとして載せる
(() => {
  const form = document.querySelector("form.req");
  if (!form) return;
  const SUPABASE_URL = "https://qfepllrtalfvyhsezjwc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_DIFM6mVEbJaB0OYSkY74Hw_1oF_6eaU";   // 公開用の鍵
  const OK = /^https:\/\/((www|m|music)\.)?(youtube\.com\/(watch\?|shorts\/)|youtu\.be\/|nicovideo\.jp\/watch\/|nico\.ms\/)/i;
  const msg = form.querySelector(".req-msg"), input = form.querySelector("input"), btn = form.querySelector("button");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const url = input.value.trim();
    if (!OK.test(url)) { msg.textContent = "YouTube かニコニコ動画の動画のURLを入れてね。"; return; }
    btn.disabled = true; msg.textContent = "送っています…";
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/cover_requests`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ song_id: form.dataset.song, url }),
      });
      if (res.ok || res.status === 409) {
        msg.textContent = "ありがとう！毎朝の更新で確認して、「" + form.dataset.title + "」の歌ってみただったらここに載せるね。";
        input.value = "";
      } else msg.textContent = "うまく送れなかったよ。時間をおいてもう一度ためしてね。";
    } catch { msg.textContent = "うまく送れなかったよ。時間をおいてもう一度ためしてね。"; }
    btn.disabled = false;
  });
})();

// 「リンクをコピー」：スマホなどの共有メニューが使えるときはそれを開き、使えないときはURLをコピー
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-share]");
  if (!b) return;
  const url = b.dataset.share, text = b.dataset.text || document.title;
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ title: document.title, text, url }); } catch {}
    return;
  }
  const label = b.textContent;
  try { await navigator.clipboard.writeText(url); b.textContent = "✓ コピーしたよ"; }
  catch { window.prompt("このURLをコピーしてね", url); }
  setTimeout(() => { b.textContent = label; }, 1800);
});
