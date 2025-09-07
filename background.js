// background.js (Chrome extension service worker script)

// Persist after every change
async function setState(obj) { await chrome.storage.session.set(obj); }
async function getState(keys) { return chrome.storage.session.get(keys); }

// --- utils (background.js)
function isEligible(url) {
  try {
    const u = new URL(url || "");
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function safeSend(tabId, msg) {
  try {
    // Promise form (MV3) – catches "Receiving end does not exist"
    await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    // ignore; tab has no content script (chrome://, web store, pdf, etc.)
  }
}

// Initialize state on extension install
chrome.runtime.onInstalled.addListener(async () => {
  await setState({ playerOpen: false, videoList: [], currentVideoIndex: 0 });
});

// Listen for extension icon clicks to toggle the mini-player
chrome.action.onClicked.addListener(async () => {
  const s = await getState(['playerOpen']);
  const playerOpen = !s.playerOpen;
  await setState({ playerOpen });
  const msg = { type: "TOGGLE_PLAYER", isOpen: playerOpen };
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id && isEligible(t.url)) await safeSend(t.id, msg);
  }
});

// Listen for messages from content scripts (for search queries and navigation controls)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PLAYER_STATE") {
    chrome.storage.session.get(['playerOpen']).then(s => sendResponse({ isOpen: s.playerOpen }));
    return true; // async
  }

  if (message.type === "SEARCH_QUERY") {
    const query = message.query;
    // Use YouTube Data API to search for videos matching the query
    // NOTE: Replace 'YOUR_API_KEY' with an actual API key from Google Cloud Console.
    const apiKey = "AIzaSyBYhOqQqRnQmJb0xBj4EP7iocDLwLfeDio";
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?` +
                   `part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}` +
                   `&key=${apiKey}`;
    fetch(apiUrl)
      .then(res => res.json())
      .then(async (data) => {
        // Parse the search results to get video IDs and titles
        const videoList = data.items?.length > 0 ? data.items.map((item) => item.id.videoId) : [];
        const currentVideoIndex = 0;
        
        // Persist the video list and index (clear if no results)
        await setState({ videoList, currentVideoIndex });
        
        if (videoList.length > 0) {
          const firstVideoId = videoList[0];
          // Notify all tabs' content scripts to load the first video result
          const loadMsg = { type: "LOAD_VIDEO", videoId: firstVideoId };
          chrome.tabs.query({}, async (tabs) => {
            for (const t of tabs) {
              if (t.id && isEligible(t.url)) await safeSend(t.id, loadMsg);
            }
          });
        }
      })
      .catch(err => console.error("YouTube API error:", err));
    // We can optionally sendResponse or return true to indicate async response, 
    // but here we just fire-and-forget the API call.
    return false; // no response expected
  }

  if (message.type === "NAVIGATE") {
    // Handle next/previous video navigation from content script
    const direction = message.direction;
    getState(['videoList', 'currentVideoIndex']).then(async (state) => {
      const { videoList = [], currentVideoIndex = 0 } = state;
      if (!videoList.length) return;  // no videos available
      
      let newIndex = currentVideoIndex;
      if (direction === "NEXT" && currentVideoIndex < videoList.length - 1) {
        newIndex++;
      } else if (direction === "PREV" && currentVideoIndex > 0) {
        newIndex--;
      } else {
        // If at the end or beginning of list, do nothing (or we could loop around)
        return;
      }
      
      // Persist the new index
      await setState({ currentVideoIndex: newIndex });
      
      const newVideoId = videoList[newIndex];
      const loadMsg = { type: "LOAD_VIDEO", videoId: newVideoId };
      chrome.tabs.query({}, async (tabs) => {
        for (const t of tabs) {
          if (t.id && isEligible(t.url)) await safeSend(t.id, loadMsg);
        }
      });
    });
  }

  // No special handling for play/pause/seek in background – those will be handled in content script directly.
});

// When a tab finishes loading and player is open, show it there too
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === "complete" && isEligible(tab?.url)) {
    const { playerOpen } = await getState(['playerOpen']);
    if (playerOpen) await safeSend(tabId, { type: "TOGGLE_PLAYER", isOpen: true });
  }
});
