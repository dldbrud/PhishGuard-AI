(() => {
  const FLOATING_ID = "pg-floating-control";
  const API_BASE = "http://49.50.135.32:8000/api";
  const EXT_BASE = chrome.runtime.getURL("");

  // ✅ 1. 페이지 진입 시 URL 검사
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

  // ✅ 3. 플로팅 UI 생성
  const existingBox = document.getElementById(FLOATING_ID);
  if (existingBox) {
    existingBox.remove();
  }
  initFloating();

  function initFloating() {
    const box = document.createElement("div");
    box.id = FLOATING_ID;
    
    // HTML 구조
    box.innerHTML = `
      <div id="pg-floating-header" title="드래그하여 이동">
        <span style="font-weight:800;">PhishingGuard</span>
        <button id="pg-minimize-btn" title="접기/펼치기">－</button>
      </div>
      
      <div id="pg-floating-content">
        <!-- 투명도 조절 -->
        <div class="pg-slider-container">
          <label for="pg-opacity-slider">투명도</label>
          <input type="range" id="pg-opacity-slider" min="0.2" max="1" step="0.05" value="0.95">
        </div>

        <div id="pg-floating-buttons">
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

    // 스타일 정의
    const style = document.createElement("style");
    style.textContent = `
      #${FLOATING_ID} { 
        position: fixed; 
        z-index: 2147483647 !important;
        background: rgba(255,255,255,0.95) !important; 
        border-radius: 12px !important; 
        box-shadow: 0 4px 20px rgba(0,0,0,0.2) !important; 
        border: 1px solid #ccc !important;
        padding: 0 !important;
        display: flex !important; 
        flex-direction: column !important; 
        font-family: sans-serif !important; 
        font-size: 12px !important; 
        width: 220px !important;
        transition: height 0.3s ease !important;
        overflow: hidden !important;
        color: #333 !important;
        opacity: 0.95;
      }
      
      #${FLOATING_ID}.minimized {
        width: 160px !important;
        height: 40px !important;
      }
      
      #pg-floating-header { 
        background: #f8f9fa !important;
        padding: 10px 12px !important;
        border-bottom: 1px solid #e9ecef !important;
        font-weight: 700 !important;
        display: flex !important; 
        justify-content: space-between !important; 
        align-items: center !important;
        cursor: move !important;
        user-select: none !important;
        height: 40px !important;
        box-sizing: border-box !important;
      }

      #pg-minimize-btn {
        width: 24px !important; height: 24px !important; border: 1px solid #ccc !important;
        background: white !important; border-radius: 4px !important; cursor: pointer !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        font-size: 16px !important; font-weight: bold !important; color: #333 !important;
        padding: 0 !important; line-height: 1 !important;
      }
      #pg-minimize-btn:hover { background: #e9ecef !important; }

      #pg-floating-content { padding: 12px !important; display: flex !important; flex-direction: column !important; gap: 10px !important; }
      
      .pg-slider-container {
        display: flex !important; align-items: center !important; gap: 8px !important; padding: 0 2px !important;
      }
      .pg-slider-container label { font-size: 11px !important; color: #666 !important; }
      #pg-opacity-slider { flex: 1 !important; cursor: pointer !important; margin: 0 !important; }

      #pg-floating-buttons { display: flex !important; gap: 8px !important; }
      #pg-floating-buttons button { 
        flex: 1 !important; border: none !important; border-radius: 6px !important; padding: 8px 0 !important;
        font-size: 11px !important; font-weight: 600 !important; cursor: pointer !important; 
        color: white !important; transition: opacity 0.2s !important;
      }
      #pg-floating-buttons button:hover { opacity: 0.9 !important; }
      #pg-block-btn { background-color: #e74c3c !important; } 
      #pg-list-btn { background-color: #3b82f6 !important; }
      
      #pg-list-panel { 
        border-top: 1px solid #eee !important; padding-top: 8px !important; 
        max-height: 150px !important; overflow-y: auto !important; 
      }
      #pg-list-inner { display: flex !important; flex-direction: column !important; gap: 4px !important; }
      .pg-url-item { display: flex !important; align-items: center !important; gap: 6px !important; font-size: 11px !important; }
      .pg-url-item span { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; max-width: 140px !important; }
      
      #pg-unblock-selected-btn {
        width: 100% !important; padding: 6px 0 !important; margin-top: 6px !important;
        border: none !important; border-radius: 4px !important;
        background: #95a5a6 !important; color: white !important; font-weight: bold !important;
        cursor: pointer !important; font-size: 11px !important;
      }
    `;
    document.head.appendChild(style);

    // --- 기능 로직 ---
    const header = box.querySelector("#pg-floating-header");
    const minimizeBtn = box.querySelector("#pg-minimize-btn"); 
    const opacitySlider = box.querySelector("#pg-opacity-slider");
    const blockBtn = box.querySelector("#pg-block-btn");
    const listBtn = box.querySelector("#pg-list-btn");
    const listPanel = box.querySelector("#pg-list-panel");
    const listInner = box.querySelector("#pg-list-inner");
    const unblockSelectedBtn = box.querySelector("#pg-unblock-selected-btn");

    // ✅ [저장된 설정 불러오기: 투명도 & 위치 & 최소화 상태]
    chrome.storage.sync.get(["pg_opacity", "pg_position", "pg_minimized"], (data) => {
      // 1. 투명도 적용
      if (data.pg_opacity) {
        const savedOpacity = data.pg_opacity;
        box.style.opacity = savedOpacity;
        opacitySlider.value = savedOpacity;
      }
      
      // 2. 위치 적용
      if (data.pg_position) {
        box.style.top = data.pg_position.top;
        box.style.left = data.pg_position.left;
        box.style.right = 'auto';
      } else {
        box.style.top = "20px";
        box.style.right = "20px";
      }

      // 3. 최소화 상태 적용
      if (data.pg_minimized) {
        box.classList.add("minimized");
        minimizeBtn.textContent = "＋";
        minimizeBtn.style.color = "#2980b9";
      } else {
        box.classList.remove("minimized");
        minimizeBtn.textContent = "－";
        minimizeBtn.style.color = "#333";
      }
    });

    // 🔹 1. 축소/확대 버튼 (상태 저장)
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation(); 
      box.classList.toggle("minimized");

      const minimizedNow = box.classList.contains("minimized");
      if (minimizedNow) {
        minimizeBtn.textContent = "＋";
        minimizeBtn.style.color = "#2980b9";
      } else {
        minimizeBtn.textContent = "－";
        minimizeBtn.style.color = "#333";
      }

      // ✅ 최소화 상태 저장
      chrome.storage.sync.set({ pg_minimized: minimizedNow });
    });

    // 🔹 2. 투명도 조절 (변경 시 저장)
    opacitySlider.addEventListener("input", (e) => {
      const val = e.target.value;
      box.style.opacity = val;
      chrome.storage.sync.set({ pg_opacity: val });
    });

    // 🔹 3. 드래그 앤 드롭 (종료 시 위치 저장)
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener("mousedown", (e) => {
      if (e.target === minimizeBtn || e.target === opacitySlider) return; 

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = box.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      
      box.style.right = 'auto';
      box.style.left = `${initialLeft}px`;
      box.style.top = `${initialTop}px`;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      box.style.left = `${initialLeft + dx}px`;
      box.style.top = `${initialTop + dy}px`;
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        const currentPos = {
          top: box.style.top,
          left: box.style.left
        };
        chrome.storage.sync.set({ pg_position: currentPos });
      }
    });

    // 🚫 차단
    blockBtn.addEventListener("click", () => {
      if (confirm("현재 사이트를 차단하고 신고하시겠습니까?")) {
        chrome.runtime.sendMessage({ type: "PG_BLOCK_URL", url: window.location.href });
      }
    });

    // 📂 목록
    listBtn.addEventListener("click", async () => {
      if (listPanel.style.display === "none") {
        listPanel.style.display = "block";
        box.classList.remove('minimized');
        minimizeBtn.textContent = "－";
        minimizeBtn.style.color = "#333";
        chrome.storage.sync.set({ pg_minimized: false });
        await loadMyBlockedUrls(listInner);
      } else {
        listPanel.style.display = "none";
      }
    });

    // 🔁 해제
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
        console.error("[PhishingGuard] 선택 해제 에러:", e);
      }
    });
  }

  // 📥 목록 로드
  async function loadMyBlockedUrls(container) {
    container.textContent = "로딩 중...";
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
        item.innerHTML = `
          <input type="checkbox" class="pg-url-check" data-url="${url}">
          <span title="${url}">${url}</span>
        `;
        container.appendChild(item);
      });
    } catch (e) {
      console.error("[PhishingGuard] 목록 로드 실패:", e);
      container.textContent = "로드 실패";
    }
  }
})();
