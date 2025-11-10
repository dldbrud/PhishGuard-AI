const API_BASE = "http://localhost:8000";

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg || "";
}

function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      resolve(tabs[0] || null);
    });
  });
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

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

// 🔴 차단하기: reported_urls + user_url_overrides 동시에, 그리고 구글로 이동
document.getElementById("btn-block").addEventListener("click", async () => {
  setStatus("차단 처리 중...");
  const tab = await getCurrentTab();
  if (!tab) return setStatus("활성 탭을 찾을 수 없습니다.");

  const url = tab.url;
  const clientId = await getClientId();

  try {
    // 1) 신고 기록
    await postJson("/report", { client_id: clientId, url });

    // 2) 개인 차단 (decision=1)
    await postJson("/override", { client_id: clientId, url, decision: 1 });

    setStatus("신고 + 개인 차단 완료. 구글로 이동합니다.");
    // 3) 현재 탭을 구글로 강제 이동
    chrome.tabs.update(tab.id, { url: "https://www.google.com" });
  } catch (e) {
    console.error(e);
    setStatus("에러 발생: 개발자 도구 콘솔을 확인하세요.");
  }
});

// 🟦 차단 해제: user_url_overrides 삭제만
document.getElementById("btn-unblock").addEventListener("click", async () => {
  setStatus("차단 해제 중...");
  const tab = await getCurrentTab();
  if (!tab) return setStatus("활성 탭을 찾을 수 없습니다.");

  const url = tab.url;
  const clientId = await getClientId();

  try {
    await postJson("/remove-override", { client_id: clientId, url });
    setStatus("해당 사이트에 대한 개인 차단이 해제되었습니다.");
  } catch (e) {
    console.error(e);
    setStatus("에러 발생: 개발자 도구 콘솔을 확인하세요.");
  }
});
