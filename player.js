// === player.js ===

const EXT_ORIGIN = location.origin;
let ytf = null;
let targetWin = null;
let handshakeDone = false;
const cmdQueue = [];

function ensureYT() {
  if (!ytf) {
    ytf = document.createElement("iframe");
    ytf.id = "yt";
    // no 'autoplay' or 'encrypted-media' in allow to avoid policy warnings; we control via URL param
    ytf.allow = "picture-in-picture";
    ytf.frameBorder = "0";
    ytf.style.width = "100%";
    ytf.style.height = "100%";
    document.body.style.margin = "0";
    document.body.style.background = "transparent";
    document.body.appendChild(ytf);
  }
  return ytf;
}

function sendListening() {
  if (!targetWin) return;
  try {
    targetWin.postMessage(JSON.stringify({ event: "listening", id: "mini-yt" }), "*");
    handshakeDone = true;
  } catch {}
}
function flushQueue() {
  while (handshakeDone && cmdQueue.length && targetWin) {
    const { func, args } = cmdQueue.shift();
    targetWin.postMessage(JSON.stringify({ event: "command", func, args: args || [] }), "*");
  }
}

window.addEventListener("message", (e) => {
  const msg = e.data;
  if (!msg || !msg.__fromCS) return;

  if (msg.type === "LOAD") {
    const iframe = ensureYT();
    targetWin = iframe.contentWindow;
    handshakeDone = false;

    const p = new URLSearchParams({
      enablejsapi: "1",
      playsinline: "1",
      autoplay: msg.autoplay ? "1" : "0",
      origin: EXT_ORIGIN
    });
    iframe.src = `https://www.youtube.com/embed/${msg.videoId}?${p.toString()}`;
    iframe.addEventListener("load", () => {
      sendListening();
      setTimeout(sendListening, 150);
      setTimeout(sendListening, 400);
    }, { once: true });
    return;
  }

  if (msg.type === "COMMAND") {
    if (!targetWin) return;
    if (!handshakeDone) cmdQueue.push({ func: msg.func, args: msg.args });
    else targetWin.postMessage(JSON.stringify({ event: "command", func: msg.func, args: msg.args || [] }), "*");
  }
});

// Bubble YouTube events to contentScript (unchanged)
window.addEventListener("message", (e) => {
  let data = e.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data.replace(/^\)\]\}'/, "")); } catch { return; }
  }
  if (!data) return;
  if (data.event === "onReady" || data.event === "infoDelivery") {
    parent.postMessage({ __fromPlayer: true, data }, "*");
  }
});