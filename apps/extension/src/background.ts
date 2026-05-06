import { activeTabDomain } from "./domain";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    void chrome.sidePanel.open({ tabId: tab.id });
  }

  const activeDomain = activeTabDomain(tab.url);
  void chrome.storage.session.set({ activeDomain });
});
