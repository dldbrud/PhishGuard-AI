const API_BASE = "http://localhost:8000";
const BLOCK_PAGE = chrome.runtime.getURL("blocked.html");

// 공통: JSON POST 유틸리티
async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// 설치당 고유 client_id
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
  // 1️⃣ URL 자동 평가
  if (msg.type === "CHECK_URL" && sender.tab) {
    const tabId = sender.tab.id;
    const url = msg.url;
    if (!url) return;

    getClientId().then((clientId) => {
      postJson("/api/evaluate", { url, client_id: clientId })
        .then((data) => {
          if (data.decision === "BLOCK") {
            const reason = encodeURIComponent(
              data.reason || "위험한 사이트로 판단되었습니다."
            );
            chrome.tabs.update(tabId, {
              url: `${BLOCK_PAGE}?reason=${reason}`,
            });
          }
        })
        .catch((err) =>
          console.error("[PhishingGuard] /api/evaluate 에러:", err)
        );
    });
  }

  // 2️⃣ 신고 + 개인 차단
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
          console.log("[PhishingGuard] 신고 + 개인 차단 완료:", url);
          const reason = encodeURIComponent(
            "사용자가 직접 차단한 사이트입니다."
          );
          chrome.tabs.update(tabId, { url: `${BLOCK_PAGE}?reason=${reason}` });
        })
        .catch((err) =>
          console.error("[PhishingGuard] PG_BLOCK_URL 에러:", err)
        );
    });
  }

  // 3️⃣ 개인 차단 해제
  if (msg.type === "PG_UNBLOCK_URL") {
    const url = msg.url;
    if (!url) return;

    getClientId().then((clientId) => {
      postJson("/api/remove-override", { client_id: clientId, url })
        .then(() =>
          console.log("[PhishingGuard] 개인 차단 해제 완료:", url)
        )
        .catch((err) =>
          console.error("[PhishingGuard] PG_UNBLOCK_URL 에러:", err)
        );
    });
  }
});
