(function () {
  // =================================================================
  // 1. 기존 차단 화면 로직 (결과 파싱 및 표시)
  // =================================================================
  const params = new URLSearchParams(window.location.search);
  const reasonRaw = params.get("reason");

  const scoreEl = document.getElementById("display-score");
  const levelEl = document.getElementById("display-level");
  const resultEl = document.getElementById("unified-result");
  const returnBtn = document.getElementById("btn-return-safe");

  let score = 90;
  let messages = [];
  let isUserBlocked = false;

  if (reasonRaw) {
    const decoded = decodeURIComponent(reasonRaw);

    const scoreMatch = decoded.match(/Score:\s*(\d+)/);
    if (scoreMatch) {
      score = parseInt(scoreMatch[1], 10);
    }

    if (decoded.includes("GSB_") || decoded.includes("MALWARE") || decoded.includes("SOCIAL_ENGINEERING")) {
      messages.push("🚨 Google Safe Browsing 데이터베이스에 악성 사이트로 등록되어 있습니다.");
      score = 100;
    }

    if (decoded.includes("USER_REPORTED") || decoded.includes("사용자가 직접")) {
      messages.push("🚫 사용자가 직접 차단한 사이트입니다.");
      isUserBlocked = true;
    } 
    
    else if (decoded.includes("Reason:")) {
      const parts = decoded.split("Reason:");
      if (parts.length > 1) {
        let aiReason = parts[1].replace(")", "").trim();
        messages.push(`🤖 AI 분석: ${aiReason}`);
      }
    }
    
    if (messages.length === 0) {
      messages.push("잠재적인 보안 위협이 감지되었습니다.");
    }
  }

  if (isUserBlocked) {
    if (scoreEl) scoreEl.style.display = "none";
    if (levelEl) levelEl.style.display = "none";
  } else {
    if (scoreEl) {
      scoreEl.style.display = "block";
      scoreEl.textContent = `${score}점`;
    }
    if (levelEl) {
      levelEl.style.display = "block";
      levelEl.textContent = (score >= 80) ? "(심각한 위험)" : "(주의 요망)";
    }
  }
  
  if (resultEl) {
    resultEl.innerText = messages.join("\n\n");
  }

  if (returnBtn) {
      returnBtn.addEventListener("click", () => {
          window.location.href = 'https://www.google.com';
      });
  }

  // =================================================================
  // 2. 플로팅 UI 생성 로직 (contentScript.js 내용 통합)
  // =================================================================
  const FLOATING_ID = "pg-floating-control";
  const API_BASE = "http://localhost:8000/api"; // API Base URL 필요

  // Client ID 가져오기 (blocked.js는 확장 프로그램 내부라 storage 접근 가능)
  function getClientId() {
    return new Promise(resolve => {
      chrome.storage.sync.get(["client_id"], data => {
        if (data.client_id) return resolve(data.client_id);
        const id = crypto.randomUUID();
        chrome.storage.sync.set({ client_id: id }, () => resolve(id));
      });
    });
  }

  function initFloating() {
    const box = document.createElement("div");
    box.id = FLOATING_ID;
    
    box.innerHTML = `
      <div id="pg-floating-header" title="드래그하여 이동">
        <span style="font-weight:800;">PhishingGuard</span>
        <button id="pg-minimize-btn" title="접기">－</button>
      </div>
      
      <div id="pg-floating-content">
        <div class="pg-slider-row">
          <span>투명도</span>
          <input type="range" id="pg-opacity-slider" min="0.2" max="1" step="0.1" value="0.95">
        </div>
        
        <div class="pg-btn-row">
          <button id="pg-block-btn">🚫 차단</button>
          <button id="pg-list-btn">📂 목록</button>
        </div>

        <div id="pg-list-panel" style="display:none;">
          <div id="pg-list-inner"></div>
          <button id="pg-unblock-selected-btn">선택 해제</button>
        </div>
      </div>
    `;
    document.body.appendChild(box);

    const style = document.createElement("style");
    style.textContent = `
      #${FLOATING_ID} { 
        position: fixed; top: 20px; right: 20px; z-index: 999999;
        background: rgba(255,255,255,0.95); border-radius: 12px; 
        box-shadow: 0 4px 15px rgba(0,0,0,0.2); border: 1px solid #ccc;
        width: 220px; overflow: hidden; font-family: sans-serif; font-size: 12px; color:#333;
        transition: height 0.2s ease; text-align: left; /* blocked.html의 center 정렬 방지 */
      }
      #${FLOATING_ID}.minimized { height: 42px !important; width: 150px !important; }
      #pg-floating-header {
        height: 42px; background: #f1f3f5; display: flex; 
        justify-content: space-between; align-items: center;
        padding: 0 12px; cursor: move; user-select: none; border-bottom: 1px solid #ddd;
        box-sizing: border-box;
      }
      #pg-minimize-btn {
        width: 24px; height: 24px; border: 1px solid #ccc; background: #fff;
        border-radius: 4px; cursor: pointer; font-weight: bold; 
        display: flex; justify-content: center; align-items: center;
        padding: 0; color: #333;
      }
      #pg-minimize-btn:hover { background: #e9ecef; }
      #pg-floating-content { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      .pg-slider-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color:#555; }
      #pg-opacity-slider { flex:1; cursor: pointer; }
      .pg-btn-row { display: flex; gap: 8px; }
      .pg-btn-row button { 
        flex: 1; padding: 8px 0; border: none; border-radius: 6px; 
        font-weight: bold; cursor: pointer; color: white; font-size: 11px;
      }
      #pg-block-btn { background: #e74c3c; }
      #pg-list-btn { background: #3b82f6; }
      #pg-list-panel { border-top:1px solid #eee; padding-top:8px; max-height:150px; overflow-y:auto; }
      #pg-list-inner { display:flex; flex-direction:column; gap:4px; }
      .pg-url-item { display:flex; gap:5px; align-items:center; }
      .pg-url-item span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px; }
      #pg-unblock-selected-btn { 
        width:100%; margin-top:5px; padding:5px; background:#95a5a6; 
        color:white; border:none; border-radius:4px; cursor:pointer; 
      }
    `;
    document.head.appendChild(style);

    // 이벤트 리스너 연결
    const header = box.querySelector("#pg-floating-header");
    const minimizeBtn = box.querySelector("#pg-minimize-btn");
    const opacitySlider = box.querySelector("#pg-opacity-slider");
    const blockBtn = box.querySelector("#pg-block-btn");
    const listBtn = box.querySelector("#pg-list-btn");
    const listPanel = box.querySelector("#pg-list-panel");
    const listInner = box.querySelector("#pg-list-inner");
    const unblockSelectedBtn = box.querySelector("#pg-unblock-selected-btn");

    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      box.classList.toggle("minimized");
      minimizeBtn.textContent = box.classList.contains("minimized") ? "＋" : "－";
    });

    opacitySlider.addEventListener("input", (e) => {
      box.style.opacity = e.target.value;
    });

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener("mousedown", (e) => {
      if (e.target === minimizeBtn) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = box.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      box.style.right = 'auto';
      box.style.left = initialLeft + 'px';
      box.style.top = initialTop + 'px';
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      box.style.left = (initialLeft + dx) + 'px';
      box.style.top = (initialTop + dy) + 'px';
    });

    window.addEventListener("mouseup", () => { isDragging = false; });

    // 차단 버튼: blocked 페이지에서는 자기 자신을 차단하는 것이 아니라,
    // 원래 접속하려던 URL을 차단해야 하지만, blocked 페이지 자체에서는 문맥상
    // 추가적인 차단 동작이 필요 없을 수 있습니다. 
    // 하지만 기능 유지를 위해 메시지 전송 코드를 남겨둡니다.
    blockBtn.addEventListener("click", () => {
        // blocked.html에서 실행되므로 현재 페이지 URL은 blocked.html 주소임.
        // 실제로는 차단된 원본 URL을 알아야 하는데, 이는 URL 파라미터 등에 없으므로 
        // 여기서는 단순히 알림만 띄우거나 비활성화하는 것이 좋습니다.
        alert("이미 차단된 페이지입니다.");
    });

    listBtn.addEventListener("click", async () => {
      if (listPanel.style.display === "none") {
        listPanel.style.display = "block";
        box.classList.remove("minimized");
        minimizeBtn.textContent = "－";
        await loadMyBlockedUrls(listInner);
      } else {
        listPanel.style.display = "none";
      }
    });

    unblockSelectedBtn.addEventListener("click", async () => {
      const checkboxes = listInner.querySelectorAll("input.pg-url-check:checked");
      if (checkboxes.length === 0) return;
      const clientId = await getClientId();
      const tasks = [];
      checkboxes.forEach(cb => {
        const url = cb.dataset.url;
        tasks.push(
          fetch(`${API_BASE}/remove-override`, {
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
        console.error("해제 실패", e);
      }
    });
  }

  async function loadMyBlockedUrls(container) {
    container.textContent = "로딩...";
    try {
      const clientId = await getClientId();
      const res = await fetch(`${API_BASE}/my-blocked-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId })
      });
      const data = await res.json();
      const urls = data.urls || [];
      container.innerHTML = "";
      if (urls.length === 0) {
        container.textContent = "차단 목록 없음";
        return;
      }
      urls.forEach(url => {
        const item = document.createElement("label");
        item.className = "pg-url-item";
        item.innerHTML = `<input type="checkbox" class="pg-url-check" data-url="${url}"><span title="${url}">${url}</span>`;
        container.appendChild(item);
      });
    } catch (e) {
      container.textContent = "실패";
    }
  }

  // 플로팅 UI 실행
  initFloating();

})();