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
      <div id="pg-floating-header">PhishingGuard</div>
      <div id="pg-floating-buttons">
        <button id="pg-block-btn">🚫 차단</button>
        <button id="pg-unblock-btn">✅ 해제</button>
        <button id="pg-list-btn">📂 내 차단 목록</button>
      </div>
      <div id="pg-list-panel" style="display:none;">
        <div id="pg-list-inner"></div>
        <button id="pg-unblock-selected-btn" style="
          margin-top:4px;
          width:100%;
          padding:4px 0;
          border:none;
          border-radius:6px;
          font-size:10px;
          cursor:pointer;
          background:#bdc3c7;
          color:#2c3e50;
        ">선택 URL 차단 해제</button>
      </div>
    `;
    document.body.appendChild(box);

    // 스타일 먼저 적용
    const style = document.createElement("style");
    style.textContent = `
      #${FLOATING_ID} { position: fixed; top: 16px; right: 16px; z-index: 2147483646;
        background: rgba(255,255,255,0.98); border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        padding: 6px 8px 8px; display: flex; flex-direction: column; gap: 4px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; }
      #pg-floating-header { font-weight: 600; font-size: 10px; color: #555;
        user-select: none; padding-bottom: 2px; border-bottom: 1px solid rgba(0,0,0,0.08); text-align: center; cursor: move; }
      #pg-floating-buttons { display: flex; gap: 4px; margin-top: 2px; }
      #pg-floating-buttons button { border: none; border-radius: 6px; padding: 4px 6px;
        font-size: 10px; cursor: pointer; font-weight: 600; transition: 0.15s; white-space: nowrap; }
      #pg-block-btn { background-color: #e74c3c; color: #fff; } #pg-block-btn:hover { background-color: #c0392b; }
      #pg-unblock-btn { background-color: #bdc3c7; color: #2c3e50; } #pg-unblock-btn:hover { background-color: #95a5a6; }
      #pg-list-btn { background-color: #3b82f6; color: #fff; } #pg-list-btn:hover { background-color: #2563eb; }
      #pg-list-panel { margin-top: 4px; max-height: 180px; overflow-y: auto; border-top: 1px solid rgba(0,0,0,0.08); padding-top: 4px; }
      #pg-list-inner { display: flex; flex-direction: column; gap: 2px; font-size: 9px; color: #333; }
      .pg-url-item { display: flex; align-items: center; gap: 4px; word-break: break-all; }
      .pg-url-item input[type="checkbox"] { margin: 0; }
    `;
    document.head.appendChild(style);

    // 🖱️ 드래그 기능 추가
    const header = document.getElementById("pg-floating-header");
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("mousedown", (e) => {
      e.preventDefault();
      isDragging = true;
      
      // 현재 위치를 left/top으로 먼저 고정
      const rect = box.getBoundingClientRect();
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.right = "auto";
      
      // 오프셋 계산
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      header.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = "move";
      }
    });

    // 버튼 이벤트
    const blockBtn = document.getElementById("pg-block-btn");
    const unblockBtn = document.getElementById("pg-unblock-btn");
    const listBtn = document.getElementById("pg-list-btn");
    const listPanel = document.getElementById("pg-list-panel");
    const listInner = document.getElementById("pg-list-inner");
    const unblockSelectedBtn = document.getElementById("pg-unblock-selected-btn");

    // 🚫 현재 페이지 차단
    blockBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "PG_BLOCK_URL", url: window.location.href });
    });

    // ✅ 현재 페이지 차단 해제
    unblockBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "PG_UNBLOCK_URL", url: window.location.href });
    });

    // 📂 내 차단 목록 표시
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
