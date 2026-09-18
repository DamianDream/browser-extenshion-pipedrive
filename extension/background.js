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

// Handle open side panel requests from content scripts or elsewhere
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'OPEN_SIDE_PANEL') {
    const tabId = sender.tab?.id;
    const targetView = message.targetView || 'history';
    const openSettings = Boolean(message.openSettings);

    // Call sidePanel.open immediately to preserve user activation gesture
    if (tabId && chrome.sidePanel?.open) {
      chrome.sidePanel.open({ tabId }).catch((error) => {
        console.warn('sidePanel.open failed:', error);
      });
    }

    // Persist active view in storage
    chrome.storage.local.set({ pf_active_view: targetView }).catch(() => {});

    // Broadcast view switch to already open side panels
    chrome.runtime.sendMessage({
      type: 'SWITCH_VIEW',
      view: targetView,
      openSettings
    }).catch(() => {});

    sendResponse?.({ ok: true });
    return true;
  }
});
