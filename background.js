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

// YouTube API search function with pagination support
async function ytSearch(query, pageToken = null) {
  const apiKey = "AIzaSyBYhOqQqRnQmJb0xBj4EP7iocDLwLfeDio";
  const u = new URL("https://www.googleapis.com/youtube/v3/search");
  u.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "25",        // pull more per page
    q: query,
    key: apiKey,
    ...(pageToken ? { pageToken } : {})
  });
  const res = await fetch(u);
  if (!res.ok) throw new Error("YouTube API error");
  return res.json();
}

// Helper function to broadcast messages to all eligible tabs
async function broadcast(msg) {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id && isEligible(t.url)) await safeSend(t.id, msg);
  }
}

// Initialize state on extension install
chrome.runtime.onInstalled.addListener(async () => {
  await setState({ 
    playerOpen: false, 
    videoList: [], 
    currentVideoIndex: 0, 
    nextPageToken: null,
    lastQuery: ""
  });
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

  if (message.type === "GET_CURRENT_VIDEO") {
    chrome.storage.session.get(['videoList', 'currentVideoIndex']).then(s => {
      const { videoList = [], currentVideoIndex = 0 } = s;
      if (videoList.length > 0 && currentVideoIndex >= 0 && currentVideoIndex < videoList.length) {
        sendResponse({ videoId: videoList[currentVideoIndex] });
      } else {
        sendResponse({ videoId: null });
      }
    });
    return true; // async
  }

  if (message.type === "SEARCH_QUERY") {
    const query = message.query;
    // Use the new ytSearch function with pagination support
    ytSearch(query)
      .then(async (data) => {
        // Parse the search results to get video IDs
        const videoList = (data.items || []).map(i => i.id.videoId);
        await setState({ 
          videoList, 
          currentVideoIndex: 0, 
          nextPageToken: data.nextPageToken || null, 
          lastQuery: query 
        });
        
        if (videoList.length > 0) {
          const firstVideoId = videoList[0];
          // Notify all tabs' content scripts to load the first video result
          await broadcast({ type: "LOAD_VIDEO", videoId: firstVideoId });
        }
      })
      .catch(err => console.error("YouTube API error:", err));
    return false; // no response expected
  }

  if (message.type === "NAVIGATE") {
    // Handle next/previous video navigation from content script
    const direction = message.direction;
    getState(['videoList', 'currentVideoIndex', 'nextPageToken', 'lastQuery']).then(async (state) => {
      const { videoList = [], currentVideoIndex = 0, nextPageToken = null, lastQuery = "" } = state;
      if (!videoList.length) return;  // no videos available
      
      let newIndex = currentVideoIndex;
      
      if (direction === "NEXT") {
        if (currentVideoIndex < videoList.length - 1) {
          // Move to next video in current list
          newIndex++;
        } else if (nextPageToken) {
          // Fetch next page of results
          try {
            const data = await ytSearch(lastQuery, nextPageToken);
            const more = (data.items || []).map(i => i.id.videoId);
            const merged = videoList.concat(more);
            newIndex = videoList.length; // first of the newly fetched items
            await setState({ 
              videoList: merged, 
              currentVideoIndex: newIndex, 
              nextPageToken: data.nextPageToken || null 
            });
          } catch (err) {
            console.error("Error fetching next page:", err);
            return;
          }
        } else {
          // No more pages available
          return;
        }
      } else if (direction === "PREV" && currentVideoIndex > 0) {
        newIndex--;
      } else {
        // If at the beginning of list, do nothing
        return;
      }
      
      // Persist the new index (if not already done in pagination)
      if (direction !== "NEXT" || currentVideoIndex < videoList.length - 1) {
        await setState({ currentVideoIndex: newIndex });
      }
      
      // Get the current state to ensure we have the latest video list
      const { videoList: vl, currentVideoIndex: idx } = await getState(['videoList', 'currentVideoIndex']);
      const newVideoId = vl[idx];
      await broadcast({ type: "LOAD_VIDEO", videoId: newVideoId });
    });
  }

  // No special handling for play/pause/seek in background – those will be handled in content script directly.
});

// When a tab finishes loading and player is open, show it there too
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === "complete" && isEligible(tab?.url)) {
    const { playerOpen, videoList, currentVideoIndex } = await getState(['playerOpen', 'videoList', 'currentVideoIndex']);
    if (playerOpen) {
      // Send a single message that includes both toggle and video info
      if (videoList && videoList.length > 0 && currentVideoIndex >= 0) {
        const currentVideoId = videoList[currentVideoIndex];
        await safeSend(tabId, { 
          type: "TOGGLE_PLAYER", 
          isOpen: true, 
          videoId: currentVideoId 
        });
      } else {
        await safeSend(tabId, { type: "TOGGLE_PLAYER", isOpen: true });
      }
    }
  }
});

// When user switches to a different tab, ensure the player is visible there too
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { playerOpen, videoList, currentVideoIndex } = await getState(['playerOpen', 'videoList', 'currentVideoIndex']);
  if (playerOpen) {
    const tab = await chrome.tabs.get(tabId);
    if (isEligible(tab?.url)) {
      // Send a single message that includes both toggle and video info
      if (videoList && videoList.length > 0 && currentVideoIndex >= 0) {
        const currentVideoId = videoList[currentVideoIndex];
        await safeSend(tabId, { 
          type: "TOGGLE_PLAYER", 
          isOpen: true, 
          videoId: currentVideoId 
        });
      } else {
        await safeSend(tabId, { type: "TOGGLE_PLAYER", isOpen: true });
      }
    }
  }
});

// When a new tab is created, ensure it gets the current player state if player is open
chrome.tabs.onCreated.addListener(async (tab) => {
  // Wait a bit for the tab to initialize, then check if player should be shown
  setTimeout(async () => {
    const { playerOpen, videoList, currentVideoIndex } = await getState(['playerOpen', 'videoList', 'currentVideoIndex']);
    if (playerOpen && isEligible(tab?.url)) {
      // Send a single message that includes both toggle and video info
      if (videoList && videoList.length > 0 && currentVideoIndex >= 0) {
        const currentVideoId = videoList[currentVideoIndex];
        await safeSend(tab.id, { 
          type: "TOGGLE_PLAYER", 
          isOpen: true, 
          videoId: currentVideoId 
        });
      } else {
        await safeSend(tab.id, { type: "TOGGLE_PLAYER", isOpen: true });
      }
    }
  }, 1000); // Wait 1 second for tab to fully initialize
});
