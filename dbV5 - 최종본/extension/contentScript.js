(() => {
  const FLOATING_ID = "pg-floating-control";
  const API_BASE = "http://localhost:8000/api"; // ✅ 변경
  const EXT_BASE = chrome.runtime.getURL("");

  // ✅ 1. 페이지 진입 시 URL 검사 (background.js로 전달)
  try {
    const url = window.location.href;
    if (!url.startsWith(EXT_BASE)) {
      chrome.runtime.sendMessage({ type: "CHECK_URL", url });
    }
  } catch (e) {
    console.warn("[PhishingGuard] CHECK_URL 전송 실패:", e);
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
      <div id="pg-floating-header" title="드래그하여 이동">PhishingGuard ✥</div>
      <div id="pg-floating-buttons">
        <button id="pg-block-btn">🚫 차단</button>
        <button id="pg-list-btn">📂 내 차단 목록</button>
      </div>
      <div id="pg-list-panel" style="display:none;">
        <div id="pg-list-inner"></div>
        <button id="pg-unblock-selected-btn" style="
          margin-top:4px; width:100%; padding:6px 0; border:none; border-radius:6px;
          font-size:11px; cursor:pointer; background:#bdc3c7; color:#2c3e50; font-weight:bold;
        ">선택 URL 차단 해제</button>
      </div>
    `;
    document.body.appendChild(box);

    // 스타일 정의
    const style = document.createElement("style");
    style.textContent = `
      #${FLOATING_ID} { 
        position: fixed; top: 16px; right: 16px; z-index: 2147483647;
        background: rgba(255,255,255,0.98); border-radius: 12px; 
        box-shadow: 0 4px 15px rgba(0,0,0,0.15); border: 1px solid rgba(0,0,0,0.05);
        padding: 10px; display: flex; flex-direction: column; gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
        font-size: 12px; min-width: 180px;
      }
      #pg-floating-header { 
        font-weight: 700; font-size: 12px; color: #555;
        padding-bottom: 6px; border-bottom: 1px solid #eee; 
        text-align: center; cursor: move; /* 🔹 이동 커서 */
        user-select: none; /* 텍스트 선택 방지 */
      }
      #pg-floating-header:active { cursor: grabbing; }
      
      #pg-floating-buttons { display: flex; gap: 6px; }
      #pg-floating-buttons button { 
        flex: 1; border: none; border-radius: 6px; padding: 8px 4px;
        font-size: 11px; cursor: pointer; font-weight: 600; transition: 0.2s; 
        color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      #pg-block-btn { background-color: #e74c3c; } 
      #pg-block-btn:hover { background-color: #c0392b; }
      
      #pg-list-btn { background-color: #3b82f6; } 
      #pg-list-btn:hover { background-color: #2563eb; }
      
      #pg-list-panel { margin-top: 4px; max-height: 200px; overflow-y: auto; border-top: 1px solid #eee; padding-top: 8px; }
      #pg-list-inner { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #333; margin-bottom: 8px; }
      .pg-url-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
      .pg-url-item input { cursor: pointer; }
      .pg-url-item span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
    `;
    document.head.appendChild(style);

    // --- 기능 로직 ---
    const header = document.getElementById("pg-floating-header");
    const blockBtn = document.getElementById("pg-block-btn");
    const listBtn = document.getElementById("pg-list-btn");
    const listPanel = document.getElementById("pg-list-panel");
    const listInner = document.getElementById("pg-list-inner");
    const unblockSelectedBtn = document.getElementById("pg-unblock-selected-btn");

    // 🔹 드래그 앤 드롭 (이동) 로직 구현
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = box.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      
      // right 속성을 해제하고 left/top으로 위치 고정 (이동을 위해)
      box.style.right = 'auto';
      box.style.left = `${initialLeft}px`;
      box.style.top = `${initialTop}px`;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      box.style.left = `${initialLeft + dx}px`;
      box.style.top = `${initialTop + dy}px`;
    });

    window.addEventListener("mouseup", () => {
      isDragging = false;
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
        listPanel.style.display = "block";
        await loadMyBlockedUrls(listInner);
      } else {
        listPanel.style.display = "none";
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
