const API_BASE = "http://localhost:8000";

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      resolve(tabs[0] || null);
    });
  });
}

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

// 신고 + 개인차단 + 구글 이동
document.getElementById("btn-report").addEventListener("click", async () => {
  setStatus("처리 중...");
  const tab = await getCurrentTab();
  if (!tab) return setStatus("탭 없음");

  const url = tab.url;
  const clientId = await getClientId();

  try {
    await postJson("/report", { client_id: clientId, url });
    await postJson("/override", { client_id: clientId, url, decision: 1 });
    setStatus("신고 + 개인 차단 완료 → 구글로 이동");
    chrome.tabs.update(tab.id, { url: "https://www.google.com" });
  } catch (e) {
    console.error(e);
    setStatus("오류 발생 (콘솔 확인)");
  }
});

// 개인 차단
document.getElementById("btn-override").addEventListener("click", async () => {
  setStatus("처리 중...");
  const tab = await getCurrentTab();
  if (!tab) return setStatus("탭 없음");

  const url = tab.url;
  const clientId = await getClientId();

  try {
    await postJson("/override", { client_id: clientId, url, decision: 1 });
    setStatus("이 사이트, 나만 차단 설정됨");
  } catch (e) {
    console.error(e);
    setStatus("오류 발생");
  }
});

// 개인 차단 해제
document.getElementById("btn-remove-override").addEventListener("click", async () => {
  setStatus("처리 중...");
  const tab = await getCurrentTab();
  if (!tab) return setStatus("탭 없음");

  const url = tab.url;
  const clientId = await getClientId();

  try {
    await postJson("/remove-override", { client_id: clientId, url });
    setStatus("이 사이트, 나만 차단 해제됨");
  } catch (e) {
    console.error(e);
    setStatus("오류 발생");
  }
});
