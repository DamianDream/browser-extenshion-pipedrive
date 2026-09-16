// Background Service Worker for Pipedrive Fields (Side Panel)

// Automatically open side panel on extension action click
chrome.sidePanel
  ?.setPanelBehavior?.({ openPanelOnActionClick: true })
  ?.catch((error) => console.debug('sidePanel behavior setup:', error));

// Notify any open side panels when active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab?.url) {
      chrome.runtime.sendMessage({
        type: 'TAB_CHANGED',
        tabId: activeInfo.tabId,
        url: tab.url
      }).catch(() => {});
    }
  } catch {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    chrome.runtime.sendMessage({
      type: 'TAB_UPDATED',
      tabId,
      url: tab.url
    }).catch(() => {});
  }
});
