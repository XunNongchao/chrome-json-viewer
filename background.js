const MENU_ID = "json-format-selection";
const PAYLOAD_PREFIX = "jsonPayload:";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "JSON格式化",
      contexts: ["selection"]
    });
  });
});

chrome.action.onClicked.addListener(() => {
  openFormatterPage();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }

  const selectedText = info.selectionText || "";
  openFormatterPage(selectedText);
});

function openFormatterPage(rawJson = "") {
  if (!rawJson) {
    chrome.tabs.create({ url: chrome.runtime.getURL("formatter.html") });
    return;
  }

  const payloadKey = `${PAYLOAD_PREFIX}${createId()}`;
  chrome.storage.local.set(
    {
      [payloadKey]: {
        text: rawJson,
        createdAt: Date.now()
      }
    },
    () => {
      const url = chrome.runtime.getURL(
        `formatter.html?payload=${encodeURIComponent(payloadKey)}`
      );

      if (chrome.runtime.lastError) {
        chrome.tabs.create({ url: chrome.runtime.getURL("formatter.html") });
        return;
      }

      chrome.tabs.create({ url });
    }
  );
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
