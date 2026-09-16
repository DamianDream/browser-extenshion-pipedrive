// Cross-browser Background Service Worker for Pipedrive Fields (Chrome & Safari)
const api = typeof browser !== 'undefined' ? browser : chrome;

// Browser detection & action setup
if (api.sidePanel?.setPanelBehavior) {
  // Google Chrome: clear popup and open native side panel on click
  api.action?.setPopup?.({ popup: '' }).catch?.(() => {});
  api.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    ?.catch((error) => console.debug('sidePanel behavior setup:', error));
} else {
  // Apple Safari & other browsers: open modern sidepanel UI in toolbar popup
  api.action?.setPopup?.({ popup: 'sidepanel.html' }).catch?.(() => {});
}

// Notify any open side panels / popups when active tab changes
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

