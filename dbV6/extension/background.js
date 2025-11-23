const API_BASE = "http://localhost:8000";
const BLOCK_PAGE = chrome.runtime.getURL("blocked.html");

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function getClientId() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["client_id"], (data) => {
      if (data.client_id) return resolve(data.client_id);
      const id = crypto.randomUUID();
      chrome.storage.sync.set({ client_id: id }, () => resolve(id));
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  // 1. URL 자동 평가
  if (msg.type === "CHECK_URL" && sender.tab) {
    const tabId = sender.tab.id;
    const url = msg.url;
    if (!url) return;

    getClientId().then((clientId) => {
      postJson("/api/evaluate", { url, client_id: clientId })
        .then((data) => {
          if (data.decision === "BLOCK") {
            const reason = encodeURIComponent(data.reason || "UNKNOWN_BLOCK");
            // ✅ 수정됨: 원래 URL 정보를 함께 전달 (&url=...)
            const redirectUrl = `${BLOCK_PAGE}?reason=${reason}&url=${encodeURIComponent(url)}`;
            chrome.tabs.update(tabId, { url: redirectUrl });
          }
        })
        .catch((err) => console.error(err));
    });
  }

  // 2. 수동 차단
  if (msg.type === "PG_BLOCK_URL" && sender.tab) {
    const tabId = sender.tab.id;
    const url = msg.url;
    if (!url) return;

    getClientId().then((clientId) => {
      Promise.all([
        postJson("/api/report", { url }),
        postJson("/api/override", { client_id: clientId, url, decision: 1 }),
      ])
        .then(() => {
          const reason = "USER_REPORTED_BLOCK";
          // ✅ 수정됨: 원래 URL 정보를 함께 전달 (&url=...)
          const redirectUrl = `${BLOCK_PAGE}?reason=${reason}&url=${encodeURIComponent(url)}`;
          chrome.tabs.update(tabId, { url: redirectUrl });
        })
        .catch((err) => console.error(err));
    });
  }

  // 3. 차단 해제
  if (msg.type === "PG_UNBLOCK_URL") {
    const url = msg.url;
    if (!url) return;
    getClientId().then((clientId) => {
      postJson("/api/remove-override", { client_id: clientId, url })
        .catch((err) => console.error(err));
    });
  }
});