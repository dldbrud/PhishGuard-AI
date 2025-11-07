const API_BASE = "http://localhost:8000";
const BLOCK_PAGE = chrome.runtime.getURL("blocked.html");

// 설치당 고유 client_id 가져오기/생성
async function getClientId() {
  return new Promise(resolve => {
    chrome.storage.sync.get(["client_id"], data => {
      if (data.client_id) {
        return resolve(data.client_id);
      }
      const id = crypto.randomUUID();
      chrome.storage.sync.set({ client_id: id }, () => {
        resolve(id);
      });
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "CHECK_URL" && sender.tab) {
    const tabId = sender.tab.id;
    const url = msg.url;

    getClientId().then(clientId => {
      if (!clientId) return;

      fetch(`${API_BASE}/check-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, url })
      })
        .then(res => res.json())
        .then(data => {
          if (data && data.is_blocked === 1) {
            chrome.tabs.update(tabId, { url: BLOCK_PAGE });
          }
        })
        .catch(err => {
          console.error("check-url error", err);
        });
    });

  }
});
