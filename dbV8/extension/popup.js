const API_BASE = "http://localhost:8000";

const loader = document.getElementById("loader");
const resultArea = document.getElementById("result-area");
const scoreVal = document.getElementById("score-val");
const statusLabel = document.getElementById("status-label");
const reasonText = document.getElementById("reason-text");
const btnBlock = document.getElementById("btn-block");
const btnUnblock = document.getElementById("btn-unblock");
const msgBox = document.getElementById("msg");

// 🔍 자세히 보기 관련
const detailBtn = document.getElementById("btn-detail");
const detailModal = document.getElementById("detail-modal");
const detailTextEl = document.getElementById("detail-text");
const detailCloseBtn = document.getElementById("btn-close-modal");

let detailText = ""; // Gemini 한국어 분석 전체 저장용

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

async function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]));
  });
}

function getTargetUrl(tab) {
  if (!tab || !tab.url) return null;
  if (tab.url.startsWith("http")) return tab.url;
  
  if (tab.url.startsWith("chrome-extension") && tab.url.includes("/blocked.html")) {
    try {
      const urlObj = new URL(tab.url);
      return urlObj.searchParams.get("url") || null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

document.addEventListener("DOMContentLoaded", async () => {
  const tab = await getCurrentTab();
  const targetUrl = getTargetUrl(tab);

  if (!targetUrl) {
    loader.style.display = "none";
    msgBox.textContent = "분석할 수 없는 페이지입니다.";
    return;
  }

  const clientId = await getClientId();

  try {
    const res = await fetch(`${API_BASE}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl, client_id: clientId })
    });
    const data = await res.json();

    loader.style.display = "none";
    resultArea.style.display = "block";

    // 1) 기본 score: reason 내부의 "Score: n" 먼저 시도
    let score = 0;
    if (data.reason) {
      const m = data.reason.match(/Score:\s*(\d+)/);
      if (m) score = parseInt(m[1], 10);
    }

    // 기본 상세 텍스트는 우선 reason으로 셋
    if (data.reason) {
      detailText = data.reason;
    }

    // 2) 전역/캐시 정보에서 ai_score + ai_reason 있으면 덮어쓰기
    try {
      const infoRes = await fetch(`${API_BASE}/api/global-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl })
      });
      const info = await infoRes.json();

      // ai_cache / phishing_sites에 저장된 점수 우선 사용
      if (typeof info.ai_score === "number") {
        const n = Number(info.ai_score);
        if (!Number.isNaN(n)) {
          score = n;
        }
      }

      // Gemini가 남긴 한국어 ai_reason이 있으면 이걸 상세 분석으로 사용
      if (info.ai_reason) {
        detailText = info.ai_reason;
      }
    } catch (e) {
      console.error("global-info 실패:", e);
    }

    // 3) 여전히 0이면 기존 로직처럼 보정
    if (data.decision === "SAFE" && score === 0) score = 10;
    if (data.decision === "BLOCK" && score === 0) score = 100;

    // UI 업데이트
    updateScoreUI(score, data.decision, data.reason);

    // 🔐 버튼 상태 설정
    const isBlocked = data.decision === "BLOCK";
    const isUserBlocked = data.reason && data.reason.includes("USER_REPORTED");
    const isSystemRisky =
      score >= 80 ||
      (data.reason && (data.reason.includes("GSB") || data.reason.includes("GEMINI_HIGH_RISK")));

    if (isBlocked) {
      btnBlock.style.display = "none";

      if (isUserBlocked) {
        btnUnblock.style.display = "block";
        msgBox.textContent = "사용자가 차단한 사이트입니다.";
        msgBox.style.color = "#e67e22";
      } else if (isSystemRisky) {
        btnUnblock.style.display = "none";
        msgBox.innerHTML = "⛔ <b>위험 사이트</b><br>보안을 위해 차단을 해제할 수 없습니다.";
        msgBox.style.color = "#e74c3c";
      } else {
        btnUnblock.style.display = "block";
        msgBox.textContent = "차단된 사이트입니다.";
      }
    } else {
      btnBlock.style.display = "block";
      btnUnblock.style.display = "none";
      msgBox.textContent = "";
    }

    // 🔍 자세히 보기 버튼 표시 여부
    if (detailBtn && detailText) {
      detailBtn.style.display = "block";
    }

  } catch (e) {
    loader.innerHTML = "서버 연결 실패";
    console.error(e);
  }
});

function updateScoreUI(score, decision, reason) {
  scoreVal.textContent = score;
  reasonText.textContent = reason || "분석 내용 없음";
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
  const targetUrl = getTargetUrl(tab);
  if (!targetUrl) return;

  const clientId = await getClientId();
  
  btnBlock.disabled = true;
  btnBlock.textContent = "차단 중...";

  try {
    await fetch(`${API_BASE}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl })
    });
    
    await fetch(`${API_BASE}/api/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, url: targetUrl, decision: 1 })
    });
    
    chrome.tabs.reload(tab.id); 
    window.close();
  } catch (e) {
    console.error("차단 실패:", e);
    btnBlock.disabled = false;
    btnBlock.textContent = "🚫 이 사이트 차단";
  }
});

// 해제 버튼 로직
btnUnblock.addEventListener("click", async () => {
  const tab = await getCurrentTab();
  const targetUrl = getTargetUrl(tab);
  if (!targetUrl) return;

  const clientId = await getClientId();
  
  btnUnblock.disabled = true;
  btnUnblock.textContent = "해제 중...";

  try {
    await fetch(`${API_BASE}/api/remove-override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, url: targetUrl })
    });
    
    alert("차단이 해제되었습니다.");
    chrome.tabs.update(tab.id, { url: targetUrl });
    window.close();
  } catch (e) {
    console.error("해제 실패:", e);
    btnUnblock.disabled = false;
    btnUnblock.textContent = "✅ 차단 해제";
  }
});

// 🔍 자세히 보기 버튼
if (detailBtn) {
  detailBtn.addEventListener("click", () => {
    if (!detailText) {
      alert("상세 분석 정보가 없습니다.");
      return;
    }
    if (detailModal && detailTextEl) {
      detailTextEl.textContent = detailText;
      detailModal.style.display = "flex";
    } else {
      alert(detailText);
    }
  });
}

// 모달 닫기
if (detailCloseBtn && detailModal) {
  detailCloseBtn.addEventListener("click", () => {
    detailModal.style.display = "none";
  });
}

if (detailModal) {
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) {
      detailModal.style.display = "none";
    }
  });
}
