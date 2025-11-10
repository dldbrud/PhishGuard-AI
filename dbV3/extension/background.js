const API_BASE = "http://localhost:8000";
const BLOCK_PAGE = chrome.runtime.getURL("blocked.html");

// 공통: JSON POST 유틸리티
async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  // 서버에서 항상 JSON 리턴한다고 가정
  return res.json();
}

// 설치당 고유 client_id (이미 있으면 재사용)
function getClientId() {
  return new Promise(resolve => {
    chrome.storage.sync.get(["client_id"], data => {
      if (data.client_id) {
        return resolve(data.client_id);
      }
      const id = crypto.randomUUID();
      chrome.storage.sync.set({ client_id: id }, () => resolve(id));
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  // 1️⃣ 자동 검사: contentScript에서 CHECK_URL 보냈을 때
  if (msg.type === "CHECK_URL" && sender.tab) {
    const tabId = sender.tab.id;
    const url = msg.url;

    if (!url) return;

    getClientId().then(clientId => {
      if (!clientId) return;

      postJson("/check-url", { client_id: clientId, url })
        .then(data => {
          // service.check_url → is_blocked: 1(전역/개인 차단), 0(허용)
          if (data && Number(data.is_blocked) === 1) {
            chrome.tabs.update(tabId, { url: BLOCK_PAGE });
          }
        })
        .catch(err => {
          console.error("[PhishingGuard] /check-url 에러:", err);
        });
    });
  }

  // 2️⃣ 플로팅/기타에서 온 개인 차단 요청: "신고 + 개인 차단" 후 차단 페이지로
  if (msg.type === "PG_BLOCK_URL" && sender.tab) {
    const tabId = sender.tab.id;
    const url = msg.url;

    if (!url) return;

    getClientId().then(clientId => {
      if (!clientId) return;

      // popup.js에서 하던 것과 동일한 흐름:
      // /report → /override(decision=1)
      Promise.all([
        postJson("/report", { client_id: clientId, url }),
        postJson("/override", { client_id: clientId, url, decision: 1 })
      ])
        .then(() => {
          console.log("[PhishingGuard] 신고 + 개인 차단 완료:", url);
          chrome.tabs.update(tabId, { url: BLOCK_PAGE });
        })
        .catch(err => {
          console.error("[PhishingGuard] PG_BLOCK_URL 에러:", err);
        });
    });
  }

  // 3️⃣ 플로팅/기타에서 온 개인 차단 해제 요청
  if (msg.type === "PG_UNBLOCK_URL") {
    const url = msg.url;
    if (!url) return;

    getClientId().then(clientId => {
      if (!clientId) return;

      postJson("/remove-override", { client_id: clientId, url })
        .then(() => {
          console.log("[PhishingGuard] 개인 차단 해제 완료:", url);
        })
        .catch(err => {
          console.error("[PhishingGuard] PG_UNBLOCK_URL 에러:", err);
        });
    });
  }
});
