// contentScript.js

// --- 1. Overlay UI Creation ---
const PLAYER_ID = "mini-yt-player";
let isPlayerVisible = false;  // track if the overlay is currently shown in this tab

// Create the container for the mini player (but don't attach yet)
const playerContainer = document.createElement("div");
playerContainer.id = PLAYER_ID;
playerContainer.classList.add("mini-player-container", "corner-top-right");  // start at top-right by default

// Build the inner HTML structure of the overlay
playerContainer.innerHTML = `
  <div class="mini-player-header">
    <input type="text" id="mini-yt-search" placeholder="Search YouTube..." />
    <button id="mini-yt-go">Go</button>
  </div>
  <div class="mini-player-video">
    <!-- The YouTube iframe will be injected here -->
    <div id="mini-yt-iframe"></div>
  </div>
`;

// Append the container to the page (initially hidden via CSS)
playerContainer.style.display = "none";
document.documentElement.appendChild(playerContainer);

// Get references to the dynamic elements
const searchInput = playerContainer.querySelector("#mini-yt-search");
const searchButton = playerContainer.querySelector("#mini-yt-go");
const videoWrapper = playerContainer.querySelector(".mini-player-video");
const iframeContainer = playerContainer.querySelector("#mini-yt-iframe");

// --- 2. YouTube embed (no external script) ---
let playerIframe = null;
let playerReady = false;
let playerState = -1; // -1 unstarted, 0 ended, 1 playing, 2 paused
let currentVideoId = null;

// Create the iframe once
function ensureIframe() {
  if (playerIframe) return playerIframe;
  playerIframe = document.createElement("iframe");
  playerIframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
  playerIframe.setAttribute("frameborder", "0");
  playerIframe.style.width = currentWidth + "px";
  playerIframe.style.height = currentHeight + "px";
  iframeContainer.innerHTML = ""; // clear container
  iframeContainer.appendChild(playerIframe);
  return playerIframe;
}

// Listen for ready messages from the player (set up once)
window.addEventListener("message", (e) => {
  // YouTube posts messages as strings; some sites prefix data with ")]}'"
  let data = e.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data.replace(/^\)\]\}'/, "")); } catch { /* ignore */ }
  }
  if (!data || typeof data !== "object") return;

  if (data.event === "onReady") {
    playerReady = true;
    console.log("YouTube player ready");
  }
  if (data.event === "infoDelivery" && typeof data.info?.playerState === "number") {
    playerState = data.info.playerState;
    console.log("Player state:", playerState);
  }
}, false);

// Load a video into the iframe
function loadVideo(videoId) {
  console.log("loadVideo called with:", videoId);
  
  // Don't reload if it's the same video
  if (currentVideoId === videoId && playerReady) {
    console.log("Same video already loaded and ready, skipping reload");
    return;
  }
  
  currentVideoId = videoId;
  const iframe = ensureIframe();
  playerReady = false; // will flip true when we receive onReady
  playerState = -1; // reset player state to unstarted
  console.log("Reset player state - ready:", playerReady, "state:", playerState);

  // Build an embed URL with JS API enabled
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    autoplay: "0",
    origin: location.origin // good practice; not strictly required
  });

  iframe.src = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  
  // Send listening message after iframe loads
  iframe.addEventListener("load", () => {
    console.log("Iframe loaded, sending listening message");
    // Send the listening message to establish handshake
    iframe.contentWindow.postMessage(JSON.stringify({
      event: "listening",
      id: "mini-yt"
    }), "*");
    
    // Also try sending it a few times with delays (YouTube API quirk)
    setTimeout(() => {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: "listening", 
        id: "mini-yt"
      }), "*");
    }, 100);
    
    setTimeout(() => {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: "listening",
        id: "mini-yt" 
      }), "*");
    }, 500);
    
    // Fallback: if still not ready after 3 seconds, mark as ready anyway
    setTimeout(() => {
      if (!playerReady) {
        console.log("Timeout reached, marking player as ready");
        playerReady = true;
      }
    }, 3000);
  }, { once: true });
}

// Send a command to the iframe player
function sendCommand(func, args = []) {
  if (!playerIframe || !playerIframe.contentWindow) {
    console.log("Cannot send command - no iframe or contentWindow");
    return;
  }
  console.log("Sending command:", func, args);
  playerIframe.contentWindow.postMessage(JSON.stringify({
    event: "command",
    func,
    args
  }), "*");
}

// --- 3. Handle messages from background (toggle, load video) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TOGGLE_PLAYER") {
    isPlayerVisible = msg.isOpen;
    if (!isPlayerVisible) {
      sendCommand("pauseVideo");
    }
    playerContainer.style.display = isPlayerVisible ? "block" : "none";
    
    // If videoId is included in the toggle message, load it
    if (msg.videoId && isPlayerVisible) {
      console.log("Loading video from toggle message:", msg.videoId);
      loadVideo(msg.videoId);
    }
  }
  if (msg.type === "LOAD_VIDEO" && isPlayerVisible) {
    const videoId = msg.videoId;
    console.log("Loading new video:", videoId);
    loadVideo(videoId);
  }
  // (We don't need to send a response in these cases)
});

// When a new tab content script loads, it should check if the player should be visible and load current video
chrome.runtime.sendMessage({ type: "GET_PLAYER_STATE" }, (res) => {
  if (res?.isOpen) {
    isPlayerVisible = true;
    playerContainer.style.display = "block";
    // Also request the current video to be loaded
    chrome.runtime.sendMessage({ type: "GET_CURRENT_VIDEO" }, (videoRes) => {
      if (videoRes?.videoId) {
        console.log("Loading current video on new tab:", videoRes.videoId);
        loadVideo(videoRes.videoId);
      }
    });
  }
});

// --- 4. Search functionality ---
searchButton.addEventListener("click", () => {
  const query = searchInput.value.trim();
  if (!query) return;
  // Send search query to background to fetch YouTube results
  chrome.runtime.sendMessage({ type: "SEARCH_QUERY", query: query });
  // (Background will handle fetching and send back a LOAD_VIDEO message for the first result)
});

// Also allow pressing "Enter" in the search box to trigger search
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    searchButton.click();
  }
});

// --- 5. Keyboard Shortcuts (hotkeys) ---
document.addEventListener("keydown", (e) => {
  if (!isPlayerVisible) return;  // only intercept keys if player is open

  // Avoid interfering with typing in the search input: if focus is in input, ignore hotkeys
  if (document.activeElement === searchInput) {
    return;
  }

  // Only act on Shift + designated key combos
  if (!e.shiftKey) return;
  const key = e.key;
  const code = e.code;
  
  // Handle numpad plus/minus for resizing
  if (code === 'NumpadAdd') {
    e.preventDefault();
    resizePlayer(true);
    return;
  }
  if (code === 'NumpadSubtract') {
    e.preventDefault();
    resizePlayer(false);
    return;
  }
  
  switch (key) {
    case " ":
      // Shift + Space: Play/Pause toggle
      e.preventDefault();
      console.log("Shift+Space pressed, playerReady:", playerReady, "playerState:", playerState);
      if (playerReady) {
        if (playerState === 1) {
          console.log("Pausing video");
          sendCommand("pauseVideo");
        } else {
          console.log("Playing video");
          sendCommand("playVideo");
        }
      } else {
        console.log("Player not ready yet, trying to play anyway");
        // Fallback: try to play even if not "ready" - sometimes works
        sendCommand("playVideo");
      }
      break;
    case "ArrowUp":
      // Shift + Up: Previous video
      e.preventDefault();
      console.log("Navigating to previous video");
      chrome.runtime.sendMessage({ type: "NAVIGATE", direction: "PREV" });
      break;
    case "ArrowDown":
      // Shift + Down: Next video
      e.preventDefault();
      console.log("Navigating to next video");
      chrome.runtime.sendMessage({ type: "NAVIGATE", direction: "NEXT" });
      break;
    case "ArrowLeft":
      // Shift + Left: Rewind 5 seconds
      e.preventDefault();
      requestAndSeekBy(-5);
      break;
    case "ArrowRight":
      // Shift + Right: Forward 5 seconds
      e.preventDefault();
      requestAndSeekBy(5);
      break;
    case "+":
    case "=":
      // Shift + '+' (which could come through as '=') – Increase size
      e.preventDefault();
      resizePlayer(true);
      break;
    case "_":
    case "-":
      // Shift + '-' (could be '_' on some keyboards) – Decrease size
      e.preventDefault();
      resizePlayer(false);
      break;
    default:
      // do nothing for other keys
      break;
  }
});

// Helper to seek +/- seconds using getCurrentTime -> seekTo
function requestAndSeekBy(delta) {
  if (!playerIframe || !playerIframe.contentWindow) return;

  const onMessage = (e) => {
    let data = e.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data.replace(/^\)\]\}'/, "")); } catch { return; }
    }
    if (!data || typeof data !== "object") return;

    // YouTube replies to getCurrentTime with {info: <seconds>, event: "infoDelivery", ...}
    if (data.event === "infoDelivery" && typeof data.info?.currentTime === "number") {
      const next = Math.max(0, Math.floor(data.info.currentTime + delta));
      window.removeEventListener("message", onMessage);
      sendCommand("seekTo", [next, true]);
    }
  };

  window.addEventListener("message", onMessage);
  sendCommand("getCurrentTime");
}

// --- 6. Resizing logic ---
let currentWidth = 400;
let currentHeight = 225;
function resizePlayer(increase) {
  const factor = 1.2;
  currentWidth = increase ? Math.min(currentWidth * factor, window.innerWidth) : Math.max(currentWidth / factor, 200);
  currentHeight = currentWidth * (225/400);
  playerContainer.style.width = currentWidth + "px";
  if (playerIframe) {
    playerIframe.style.width = currentWidth + "px";
    playerIframe.style.height = currentHeight + "px";
  }
}

// --- 7. Corner position cycling on hover ---
const cornerClasses = ["corner-top-right", "corner-bottom-right", "corner-bottom-left", "corner-top-left"];
let currentCornerIndex = 0;
videoWrapper.addEventListener("mouseenter", () => {
  // Only trigger if the player is visible
  if (!isPlayerVisible) return;
  // Remove current corner class
  playerContainer.classList.remove(cornerClasses[currentCornerIndex]);
  // Move to next corner in sequence
  currentCornerIndex = (currentCornerIndex + 1) % cornerClasses.length;
  playerContainer.classList.add(cornerClasses[currentCornerIndex]);
});

// --- 8. Auto-pause when tab hidden to prevent multiple audio streams ---
document.addEventListener("visibilitychange", () => {
  if (playerIframe && playerReady && document.hidden) {
    sendCommand("pauseVideo");
  }
});
