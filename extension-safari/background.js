// Background Service Worker for Pipedrive Fields (Safari WebExtension)
const api = typeof browser !== 'undefined' ? browser : chrome;

// Notify any open popups when active tab changes
api.tabs?.onActivated?.addListener?.(async (activeInfo) => {
  try {
    const tab = await api.tabs.get(activeInfo.tabId);
    if (tab?.url) {
      api.runtime.sendMessage({
        type: 'TAB_CHANGED',
        tabId: activeInfo.tabId,
        url: tab.url
      }).catch(() => {});
    }
  } catch {}
});

api.tabs?.onUpdated?.addListener?.((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    api.runtime.sendMessage({
      type: 'TAB_UPDATED',
      tabId,
      url: tab.url
    }).catch(() => {});
  }
});

