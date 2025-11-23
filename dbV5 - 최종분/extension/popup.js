// popup.js
const API_BASE = "http://localhost:8000";

// UI 요소
const loader = document.getElementById("loader");
const resultArea = document.getElementById("result-area");
const scoreVal = document.getElementById("score-val");
const statusLabel = document.getElementById("status-label");
const reasonText = document.getElementById("reason-text");
const btnBlock = document.getElementById("btn-block");
const btnUnblock = document.getElementById("btn-unblock");
const msgBox = document.getElementById("msg");

function getClientId() {
  return new Promise(resolve => {
    chrome.storage.sync.get(["client_id"], data => {
      if (data.client_id) resolve(data.client_id);
      else {
        const id = crypto.randomUUID();
        chrome.storage.sync.set({ client_id: id }, () => resolve(id));
      }
    });
  });
}

// 탭 URL 가져오기
async function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]));
  });
}

// 1. 팝업 열리면 바로 분석 요청
document.addEventListener("DOMContentLoaded", async () => {
  const tab = await getCurrentTab();
  if (!tab || !tab.url.startsWith("http")) {
    loader.style.display = "none";
    msgBox.textContent = "분석할 수 없는 페이지입니다.";
    return;
  }

  const clientId = await getClientId();

  try {
    // API 호출
    const res = await fetch(`${API_BASE}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tab.url, client_id: clientId })
    });
    const data = await res.json();

    // UI 업데이트
    loader.style.display = "none";
    resultArea.style.display = "block";

    // 점수 파싱 (reason 텍스트에서 Score 추출하거나 백엔드 응답 구조를 활용)
    // 현재 백엔드 응답: { decision: "BLOCK", reason: "...", suggested_official_url: ... }
    // 점수가 reason 문자열에 포함되어 있음: "GEMINI_HIGH_RISK (Score: 85, ...)"
    
    let score = 0;
    const scoreMatch = data.reason.match(/Score:\s*(\d+)/);
    if (scoreMatch) {
      score = parseInt(scoreMatch[1]);
    } else if (data.decision === "SAFE") {
      score = 10; // 기본 안전 점수
    } else {
      score = 90; // 기본 위험 점수
    }

    updateScoreUI(score, data.decision, data.reason);
    
    // 차단 상태에 따라 버튼 토글
    if (data.decision === "BLOCK") {
        // 이미 차단된 상태라면 (여기로 올 확률은 적지만 오버라이드 체크용)
        // 실제로는 blocked.html로 리다이렉트 되므로 여기서는 사용자가 강제 차단하고 싶을 때를 대비
    }

  } catch (e) {
    loader.innerHTML = "서버 연결 실패";
    console.error(e);
  }
});

function updateScoreUI(score, decision, reason) {
  scoreVal.textContent = score;
  reasonText.textContent = reason;

  scoreVal.classList.remove("safe", "warn", "danger");
  
  if (score >= 80 || decision === "BLOCK") {
    scoreVal.classList.add("danger");
    statusLabel.textContent = "위험 (Phishing)";
    statusLabel.style.color = "#e74c3c";
  } else if (score >= 50 || decision === "WARN") {
    scoreVal.classList.add("warn");
    statusLabel.textContent = "주의 요망";
    statusLabel.style.color = "#f39c12";
  } else {
    scoreVal.classList.add("safe");
    statusLabel.textContent = "안전함";
    statusLabel.style.color = "#27ae60";
  }
}

// 차단 버튼 로직
btnBlock.addEventListener("click", async () => {
  const tab = await getCurrentTab();
  const clientId = await getClientId();
  await fetch(`${API_BASE}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: tab.url })
  });
  await fetch(`${API_BASE}/api/override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, url: tab.url, decision: 1 })
  });
  chrome.tabs.update(tab.id, { url: "https://www.google.com" });
  window.close();
});

// 해제 버튼 로직 (차단된 페이지가 아니어도 미리 해제)
btnUnblock.addEventListener("click", async () => {
    const tab = await getCurrentTab();
    const clientId = await getClientId();
    await fetch(`${API_BASE}/api/remove-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, url: tab.url })
    });
    msgBox.textContent = "차단 해제 설정됨";
});