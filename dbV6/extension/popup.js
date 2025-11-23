const API_BASE = "http://localhost:8000";

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

    let score = 0;
    if (data.reason) {
        const scoreMatch = data.reason.match(/Score:\s*(\d+)/);
        if (scoreMatch) score = parseInt(scoreMatch[1]);
    }
    
    if (data.decision === "SAFE" && score === 0) score = 10;
    if (data.decision === "BLOCK" && score === 0) score = 100;

    updateScoreUI(score, data.decision, data.reason);
    
    // ✅ 차단 상태 및 원인 분석
    const isBlocked = data.decision === "BLOCK";
    // 사용자 수동 차단 여부 확인
    const isUserBlocked = data.reason && (data.reason.includes("USER_REPORTED") || data.reason.includes("BLOCK"));
    // 시스템(AI/GSB)에 의한 위험 차단 여부 (점수가 높거나 GSB 매칭)
    const isSystemRisky = score >= 80 || (data.reason && (data.reason.includes("GSB") || data.reason.includes("GEMINI_HIGH_RISK")));

    if (isBlocked) {
        btnBlock.style.display = "none"; // 이미 차단됨 -> 차단 버튼 숨김

        // 🔒 [핵심 수정] 사용자 차단인 경우에만 해제 허용
        if (isUserBlocked) {
            btnUnblock.style.display = "block";
            msgBox.textContent = "사용자가 차단한 사이트입니다.";
            msgBox.style.color = "#e67e22"; // 주황색 (알림)
        } else if (isSystemRisky) {
            // 🚫 시스템이 막은 경우 해제 불가
            btnUnblock.style.display = "none"; 
            msgBox.innerHTML = "⛔ <b>위험 사이트</b><br>보안을 위해 차단을 해제할 수 없습니다.";
            msgBox.style.color = "#e74c3c"; // 빨간색 (경고)
        } else {
            // 기타 애매한 경우 (일단 해제 허용하되 경고)
            btnUnblock.style.display = "block";
            msgBox.textContent = "차단된 사이트입니다.";
        }
    } else {
        // 차단되지 않음 -> 차단 버튼 표시
        btnBlock.style.display = "block";
        btnUnblock.style.display = "none";
        msgBox.textContent = "";
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