(() => {
  const FLOATING_ID = "pg-floating-control";
  const API_BASE = "http://localhost:8000/api"; // ✅ 변경
  const EXT_BASE = chrome.runtime.getURL("");

  // ✅ 1. 페이지 진입 시 URL 검사 (background.js로 전달)
  // blocked.html이 아닐 때만 URL 검사
  if (!window.location.href.includes("blocked.html")) {
    try {
      const url = window.location.href;
      if (!url.startsWith(EXT_BASE)) {
        chrome.runtime.sendMessage({ type: "CHECK_URL", url });
      }
    } catch (e) {
      console.warn("[PhishingGuard] CHECK_URL 전송 실패:", e);
    }
  }

  // ✅ 2. client_id 가져오기
  function getClientId() {
    return new Promise(resolve => {
      chrome.storage.sync.get(["client_id"], data => {
        if (data.client_id) return resolve(data.client_id);
        const id = crypto.randomUUID();
        chrome.storage.sync.set({ client_id: id }, () => resolve(id));
      });
    });
  }

  // ✅ 3. 플로팅 UI 없으면 생성
  if (!document.getElementById(FLOATING_ID)) {
    initFloating();
  }

  function initFloating() {
    const box = document.createElement("div");
    box.id = FLOATING_ID;
    
    box.innerHTML = `
      <div id="pg-floating-header">
        <span id="pg-header-text">PhishingGuard</span>
        <span id="pg-toggle-btn">▼</span>
      </div>
      <div id="pg-floating-content">
        <div id="pg-floating-buttons">
          <button id="pg-block-btn">🚫 차단</button>
          <button id="pg-list-btn">📂 차단 목록</button>
          <button id="pg-analyze-btn">🔍 분석하기</button>
        </div>
        <div id="pg-list-panel" style="display:none;">
          <div id="pg-list-inner"></div>
          <button id="pg-unblock-selected-btn" style="
            margin-top:4px; width:100%; padding:6px 0; border:none; border-radius:6px;
            font-size:11px; cursor:pointer; background:#bdc3c7; color:#2c3e50; font-weight:bold;
          ">선택 URL 차단 해제</button>
        </div>
        <div id="pg-analyze-panel" style="display:none;">
          <div id="pg-analyze-loader" style="text-align:center; padding:10px; color:#888;">
            <span class="pg-spinner"></span> 분석 중...
          </div>
          <div id="pg-analyze-result" style="display:none; padding:10px; background:#f8f9fa; border-radius:8px;">
            <div style="text-align:center; margin-bottom:8px;">
              <div id="pg-analyze-status" style="font-size:13px; font-weight:600; color:#333;">안전함</div>
              <div id="pg-analyze-score" style="font-size:32px; font-weight:800; margin:8px 0; color:#bdc3c7;">--점</div>
            </div>
            <div id="pg-analyze-reason" style="font-size:11px; color:#666; line-height:1.4; background:#fff; padding:8px; border-radius:6px; word-break:break-all;"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(box);

    // 스타일 정의
    const style = document.createElement("style");
    style.textContent = `
      #${FLOATING_ID} { 
        position: fixed; top: 16px; right: 16px; z-index: 2147483647;
        background: rgba(255,255,255,0.98); border-radius: 20px; 
        box-shadow: 0 3px 10px rgba(0,0,0,0.15); border: 1px solid rgba(0,0,0,0.1);
        padding: 0; display: flex; flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
        transition: all 0.3s ease;
      }
      
      #${FLOATING_ID}.collapsed {
        width: auto;
      }
      
      #${FLOATING_ID}:not(.collapsed) {
        width: 200px;
        padding: 6px;
        gap: 5px;
      }
      
      #pg-floating-header { 
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 700;
        font-size: 11px;
        color: #555;
        cursor: pointer;
        user-select: none;
        padding: 8px 12px;
        border-radius: 20px;
        transition: background 0.2s;
      }
      
      #${FLOATING_ID}.collapsed #pg-floating-header {
        background: white;
      }
      
      #${FLOATING_ID}:not(.collapsed) #pg-floating-header {
        padding: 0;
        padding-bottom: 4px;
        border-bottom: 1px solid #eee;
      }
      
      #pg-header-text {
        flex: 1;
      }
      
      #pg-toggle-btn {
        font-size: 8px;
        color: #888;
        transition: transform 0.3s ease;
        margin-left: 4px;
      }
      
      #${FLOATING_ID}.collapsed #pg-toggle-btn {
        transform: rotate(-90deg);
      }
      
      #pg-floating-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow: hidden;
        transition: all 0.3s ease;
      }
      
      #${FLOATING_ID}.collapsed #pg-floating-content {
        max-height: 0;
        opacity: 0;
      }
      
      #${FLOATING_ID}:not(.collapsed) #pg-floating-content {
        max-height: 500px;
        opacity: 1;
      }
      
      #pg-floating-buttons { 
        display: flex; 
        gap: 3px; 
        flex-wrap: wrap;
      }
      
      #pg-floating-buttons button { 
        flex: 1;
        min-width: 42px;
        border: none; 
        border-radius: 6px; 
        padding: 6px 4px;
        font-size: 9px; 
        cursor: pointer; 
        font-weight: 600; 
        transition: all 0.2s; 
        color: white; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      #pg-block-btn { background-color: #e74c3c; } 
      #pg-block-btn:hover { background-color: #c0392b; transform: translateY(-1px); }
      
      #pg-list-btn { background-color: #5b7ce6; } 
      #pg-list-btn:hover { background-color: #4a6cd4; transform: translateY(-1px); }
      
      #pg-analyze-btn { background-color: #95a5a6; }
      #pg-analyze-btn:hover { background-color: #7f8c8d; transform: translateY(-1px); }
      
      #pg-list-panel { margin-top: 3px; max-height: 150px; overflow-y: auto; border-top: 1px solid #eee; padding-top: 6px; }
      #pg-list-inner { display: flex; flex-direction: column; gap: 3px; font-size: 9px; color: #333; margin-bottom: 6px; }
      .pg-url-item { display: flex; align-items: center; gap: 4px; padding: 2px 0; }
      .pg-url-item input { cursor: pointer; }
      .pg-url-item span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
      
      #pg-analyze-panel { margin-top: 3px; border-top: 1px solid #eee; padding-top: 6px; }
      .pg-spinner {
        display: inline-block;
        width: 10px;
        height: 10px;
        border: 2px solid #ccc;
        border-top-color: #333;
        border-radius: 50%;
        animation: pg-spin 1s linear infinite;
        margin-right: 4px;
      }
      @keyframes pg-spin {
        to { transform: rotate(360deg); }
      }
      #pg-analyze-score.safe { color: #27ae60; }
      #pg-analyze-score.warn { color: #f39c12; }
      #pg-analyze-score.danger { color: #e74c3c; }
    `;
    document.head.appendChild(style);

    // --- 기능 로직 ---
    const header = document.getElementById("pg-floating-header");
    const toggleBtn = document.getElementById("pg-toggle-btn");
    const floatingContent = document.getElementById("pg-floating-content");
    const blockBtn = document.getElementById("pg-block-btn");
    const listBtn = document.getElementById("pg-list-btn");
    const analyzeBtn = document.getElementById("pg-analyze-btn");
    const listPanel = document.getElementById("pg-list-panel");
    const listInner = document.getElementById("pg-list-inner");
    const unblockSelectedBtn = document.getElementById("pg-unblock-selected-btn");
    const analyzePanel = document.getElementById("pg-analyze-panel");
    const analyzeLoader = document.getElementById("pg-analyze-loader");
    const analyzeResult = document.getElementById("pg-analyze-result");
    const analyzeStatus = document.getElementById("pg-analyze-status");
    const analyzeScore = document.getElementById("pg-analyze-score");
    const analyzeReason = document.getElementById("pg-analyze-reason");

    // 🔽 토글 버튼 (접기/펼치기)
    let isCollapsed = false;
    header.addEventListener("click", () => {
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        box.classList.add("collapsed");
      } else {
        box.classList.remove("collapsed");
      }
    });

    // 🚫 현재 페이지 차단
    blockBtn.addEventListener("click", () => {
      if(confirm("현재 사이트를 차단하고 신고하시겠습니까?")) {
        chrome.runtime.sendMessage({ type: "PG_BLOCK_URL", url: window.location.href });
      }
    });

    // 📂 내 차단 목록 표시/숨기기
    listBtn.addEventListener("click", async () => {
      if (listPanel.style.display === "none") {
        analyzePanel.style.display = "none"; // 분석 패널 닫기
        listPanel.style.display = "block";
        await loadMyBlockedUrls(listInner);
      } else {
        listPanel.style.display = "none";
      }
    });

    // 🔍 분석하기
    analyzeBtn.addEventListener("click", async () => {
      if (analyzePanel.style.display === "none") {
        listPanel.style.display = "none"; // 차단 목록 패널 닫기
        analyzePanel.style.display = "block";
        analyzeLoader.style.display = "block";
        analyzeResult.style.display = "none";
        
        try {
          const clientId = await getClientId();
          const url = window.location.href;
          
          const res = await fetch(`${API_BASE}/evaluate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: clientId, url })
          });
          
          const data = await res.json();
          
          // 로딩 숨기고 결과 표시
          analyzeLoader.style.display = "none";
          analyzeResult.style.display = "block";
          
          // 점수 계산 및 표시
          let score = 0;
          let statusText = "안전함";
          let scoreClass = "safe";
          
          if (data.decision === "BLOCK") {
            score = 90;
            statusText = "위험 (Phishing)";
            scoreClass = "danger";
          } else if (data.decision === "WARN") {
            score = 50;
            statusText = "주의 요망";
            scoreClass = "warn";
          } else {
            score = 0;
            statusText = "안전함";
            scoreClass = "safe";
          }
          
          // 점수에서 추출 시도
          const scoreMatch = data.reason?.match(/Score:\s*(\d+)/);
          if (scoreMatch) {
            score = parseInt(scoreMatch[1], 10);
          }
          
          analyzeStatus.textContent = statusText;
          analyzeScore.textContent = score + "점";
          analyzeScore.className = scoreClass;
          analyzeReason.textContent = data.reason || "상세 정보 없음";
          
          // 🚨 위험할 때 자동 차단
          if (data.decision === "BLOCK") {
            try {
              // 신고 API 호출
              await fetch(`${API_BASE}/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: clientId, url })
              });
              
              // 개인 차단 목록에 추가
              await fetch(`${API_BASE}/override`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: clientId, url, decision: 1 })
              });
              
              console.log("[PhishingGuard] 위험 사이트 자동 차단:", url);
            } catch (blockErr) {
              console.error("[PhishingGuard] 자동 차단 실패:", blockErr);
            }
          }
          
        } catch (e) {
          console.error("[PhishingGuard] 분석 에러:", e);
          analyzeLoader.style.display = "none";
          analyzeResult.style.display = "block";
          analyzeStatus.textContent = "분석 실패";
          analyzeScore.textContent = "--";
          analyzeScore.className = "";
          analyzeReason.textContent = "서버와 연결할 수 없습니다.";
        }
      } else {
        analyzePanel.style.display = "none";
      }
    });

    // 🔁 선택된 URL 해제
    unblockSelectedBtn.addEventListener("click", async () => {
      const checkboxes = listInner.querySelectorAll("input.pg-url-check:checked");
      if (checkboxes.length === 0) return;
      const clientId = await getClientId();
      const tasks = [];
      checkboxes.forEach(cb => {
        const url = cb.dataset.url;
        tasks.push(
          fetch(`${API_BASE}/remove-override`, { // ✅ 수정
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: clientId, url })
          })
        );
      });
      try {
        await Promise.all(tasks);
        await loadMyBlockedUrls(listInner);
      } catch (e) {
        console.error("[PhishingGuard] 선택 해제 에러:", e);
      }
    });
  }

  // 📥 내 차단 목록 불러오기
  async function loadMyBlockedUrls(container) {
    container.textContent = "불러오는 중...";
    try {
      const clientId = await getClientId();
      const res = await fetch(`${API_BASE}/my-blocked-urls`, { // ✅ 수정
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId })
      });
      const data = await res.json();
      const urls = data.urls || [];
      container.innerHTML = "";

      if (urls.length === 0) {
        container.textContent = "차단한 사이트가 없습니다.";
        return;
      }

      urls.forEach(url => {
        const item = document.createElement("label");
        item.className = "pg-url-item";
        item.innerHTML = `
          <input type="checkbox" class="pg-url-check" data-url="${url}">
          <span>${url}</span>
        `;
        container.appendChild(item);
      });
    } catch (e) {
      console.error("[PhishingGuard] /my-blocked-urls 에러:", e);
      container.textContent = "목록을 불러오지 못했습니다.";
    }
  }
})();
