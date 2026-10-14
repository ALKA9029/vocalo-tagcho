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
