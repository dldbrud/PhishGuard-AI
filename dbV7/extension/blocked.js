;(() => {
  const params = new URLSearchParams(window.location.search)
  const reasonRaw = params.get("reason")
  const originalUrl = params.get("url") // 🔥 원래 접속하려던 URL

  const scoreEl = document.getElementById("display-score")
  const levelEl = document.getElementById("display-level")
  const resultSummaryEl = document.getElementById("unified-result-summary")
  const returnBtn = document.getElementById("btn-return-safe")
  const detailBtn = document.getElementById("btn-show-detail")
  const modal = document.getElementById("detail-modal")
  const detailContent = document.getElementById("detail-content")
  const closeModalBtn = document.getElementById("btn-close-modal")

  const API_BASE = "http://localhost:8000/api"

  const messages = []
  const detailMessages = [] // 상세 메시지 저장용
  let isGlobalBlocked = false
  let isUserBlocked = false
  let score = 90
  let officialUrl = null

  function createCleanSummary(fullReason) {
    // 특정 키워드를 감지하여 깔끔한 요약 생성
    if (fullReason.includes("공식 사이트를 모방") || fullReason.includes("모방한")) {
      return "특정 공식 사이트를 모방한 사이트로 의심됩니다"
    }
    if (fullReason.includes("피싱")) {
      return "피싱 사이트로 의심되는 웹사이트입니다"
    }
    if (fullReason.includes("악성코드") || fullReason.includes("malware")) {
      return "악성코드가 포함된 위험한 사이트입니다"
    }
    if (fullReason.includes("사기") || fullReason.includes("scam")) {
      return "사기 사이트로 의심됩니다"
    }
    if (fullReason.includes("개인정보")) {
      return "개인정보 유출 위험이 있는 사이트입니다"
    }

    // 기본: 첫 문장만 추출하되 60자 제한
    const firstSentence = fullReason.split(/[.\n]/)[0].trim()
    if (firstSentence.length > 60) {
      return firstSentence.substring(0, 60) + "..."
    }
    return firstSentence
  }

  // ---------------------------
  // 1. reasonRaw 1차 해석
  // ---------------------------
  if (reasonRaw) {
    const decoded = decodeURIComponent(reasonRaw)

    const scoreMatch = decoded.match(/Score:\s*(\d+)/)
    if (scoreMatch) score = Number.parseInt(scoreMatch[1], 10)

    // 개인 차단
    if (decoded.includes("USER_REPORTED")) {
      messages.push("사용자가 직접 차단한 사이트입니다")
      detailMessages.push("🚫 사용자가 직접 차단한 사이트입니다.")
      isUserBlocked = true
    }

    // GSB 전역 차단
    if (decoded.includes("GSB_") || decoded.includes("MALWARE")) {
      messages.push("위험한 사이트로 등록되어 차단되었습니다")
      detailMessages.push(
        "🚨 Google Safe Browsing에서 위험 사이트로 등록되어 있습니다.\n\n이 사이트는 악성코드, 피싱, 또는 기타 보안 위협을 포함할 수 있습니다.",
      )
      isGlobalBlocked = true
      score = 100
    }

    // Gemini HIGH RISK 전역 차단
    if (decoded.includes("GEMINI_HIGH_RISK")) {
      messages.push("AI 분석 결과 위험도가 높은 사이트입니다")
      detailMessages.push(
        "🤖 AI 분석 결과 위험도 HIGH RISK입니다.\n\n고급 AI 분석을 통해 이 사이트가 피싱, 사기, 또는 악성 활동에 사용될 가능성이 높다고 판단되었습니다.",
      )
      isGlobalBlocked = true
    }

    // 🔥 전역 DB에서 바로 막힌 경우 (GLOBAL_DB_BLOCK)
    if (decoded.includes("GLOBAL_DB_BLOCK")) {
      isGlobalBlocked = true
    }
  }

  // ---------------------------
  // 2. 전역 차단이면 DB에서 상세 정보 불러오기
  // ---------------------------
  async function loadGlobalReason() {
    if (!originalUrl) return

    try {
      const res = await fetch(`${API_BASE}/global-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: originalUrl }),
      })
      const data = await res.json()

      if (data.ai_reason) {
        const fullReason = data.ai_reason

        const summary = createCleanSummary(fullReason)

        messages.push(summary)
        detailMessages.push(`🔍 AI 상세 분석:\n\n${fullReason}`)
      }

      if (data.official_url) {
        officialUrl = data.official_url
        detailMessages.push(
          `\n━━━━━━━━━━━━━━━━━━━━━━\n\n➡️ 공식 사이트: ${data.official_url}\n\n안전을 위해 공식 사이트로 이동하시기 바랍니다.`,
        )
      }
    } catch (e) {
      messages.push("차단 정보 조회 실패")
      detailMessages.push(
        "⚠️ 전역 차단 정보 조회에 실패했습니다.\n\n네트워크 연결을 확인하거나 관리자에게 문의해주세요.",
      )
    }
  }

  // ---------------------------
  // 3. 화면 표시
  // ---------------------------
  async function render() {
    if (isGlobalBlocked) {
      await loadGlobalReason()
    }

    if (isUserBlocked) {
      if (scoreEl) scoreEl.style.display = "none"
      if (levelEl) levelEl.style.display = "none"
    } else {
      if (scoreEl) {
        scoreEl.style.display = "block"
        scoreEl.textContent = `${score}점`
      }
      if (levelEl) {
        levelEl.style.display = "block"
        levelEl.textContent = score >= 80 ? "(심각한 위험)" : "(주의 요망)"
      }
    }

    if (resultSummaryEl) {
      if (messages.length > 0) {
        const displayText = messages.join(" • ")

        if (officialUrl) {
          // 텍스트 부분 추가
          const textNode = document.createTextNode(displayText + "\n\n✅ 공식 사이트: ")
          resultSummaryEl.innerHTML = ""
          resultSummaryEl.appendChild(textNode)

          // 클릭 가능한 링크 추가
          const link = document.createElement("a")
          link.href = officialUrl
          link.textContent = officialUrl
          link.style.color = "#fff"
          link.style.textDecoration = "underline"
          link.style.fontWeight = "600"
          link.target = "_blank"
          resultSummaryEl.appendChild(link)
        } else {
          resultSummaryEl.innerText = displayText
        }
      } else {
        resultSummaryEl.innerText = "관리자가 차단한 사이트입니다"
      }
    }

    if (detailBtn && detailMessages.length > 0) {
      detailBtn.style.display = "block"
    }
  }

  render()

  if (returnBtn) {
    returnBtn.addEventListener("click", () => {
      window.location.href = "https://www.google.com"
    })
  }

  if (detailBtn) {
    detailBtn.addEventListener("click", () => {
      if (detailContent) {
        const detailText = detailMessages.join("\n\n")

        // 공식 사이트 URL을 링크로 변환
        if (officialUrl) {
          const parts = detailText.split(officialUrl)
          detailContent.innerHTML = ""

          for (let i = 0; i < parts.length; i++) {
            detailContent.appendChild(document.createTextNode(parts[i]))

            if (i < parts.length - 1) {
              const link = document.createElement("a")
              link.href = officialUrl
              link.textContent = officialUrl
              link.style.color = "#3b82f6"
              link.style.textDecoration = "underline"
              link.style.fontWeight = "600"
              link.target = "_blank"
              detailContent.appendChild(link)
            }
          }
        } else {
          detailContent.innerText = detailText
        }
      }
      if (modal) {
        modal.style.display = "flex"
      }
    })
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      if (modal) {
        modal.style.display = "none"
      }
    })
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none"
      }
    })
  }

  // =================================================================
  // 4. 플로팅 UI 생성 로직 (기존 스타일 그대로 복원)
  // =================================================================
  const FLOATING_ID = "pg-floating-control"
  const chrome = window.chrome // Declare the chrome variable

  function getClientId() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["client_id"], (data) => {
        if (data.client_id) return resolve(data.client_id)
        const id = crypto.randomUUID()
        chrome.storage.sync.set({ client_id: id }, () => resolve(id))
      })
    })
  }

  function initFloating() {
    const box = document.createElement("div")
    box.id = FLOATING_ID

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
    `
    document.body.appendChild(box)

    const style = document.createElement("style")
    style.textContent = `
      #${FLOATING_ID} {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        background: rgba(255,255,255,0.95);
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        border: 1px solid #ccc;
        width: 220px;
        overflow: hidden;
        font-family: sans-serif;
        font-size: 12px;
        color:#333;
        transition: height 0.2s ease;
        text-align: left; /* blocked.html의 center 정렬 방지 */
      }
      #${FLOATING_ID}.minimized {
        height: 42px !important;
        width: 150px !important;
      }
      #pg-floating-header {
        height: 42px;
        background: #f1f3f5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 12px;
        cursor: move;
        user-select: none;
        border-bottom: 1px solid #ddd;
        box-sizing: border-box;
      }
      #pg-minimize-btn {
        width: 24px;
        height: 24px;
        border: 1px solid #ccc;
        background: #fff;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0;
        color: #333;
      }
      #pg-minimize-btn:hover {
        background: #e9ecef;
      }
      #pg-floating-content {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .pg-slider-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color:#555;
      }
      #pg-opacity-slider {
        flex:1;
        cursor: pointer;
      }
      .pg-btn-row {
        display: flex;
        gap: 8px;
      }
      .pg-btn-row button {
        flex: 1;
        padding: 8px 0;
        border: none;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
        color: white;
        font-size: 11px;
      }
      #pg-block-btn {
        background: #e74c3c;
      }
      #pg-list-btn {
        background: #3b82f6;
      }
      #pg-list-panel {
        border-top:1px solid #eee;
        padding-top:8px;
        max-height:150px;
        overflow-y:auto;
      }
      #pg-list-inner {
        display:flex;
        flex-direction:column;
        gap:4px;
      }
      .pg-url-item {
        display:flex;
        gap:5px;
        align-items:center;
      }
      .pg-url-item span {
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width:140px;
      }
      #pg-unblock-selected-btn {
        width:100%;
        margin-top:5px;
        padding:5px;
        background:#95a5a6;
        color:white;
        border:none;
        border-radius:4px;
        cursor:pointer;
      }
    `
    document.head.appendChild(style)

    const header = box.querySelector("#pg-floating-header")
    const minimizeBtn = box.querySelector("#pg-minimize-btn")
    const opacitySlider = box.querySelector("#pg-opacity-slider")
    const blockBtn = box.querySelector("#pg-block-btn")
    const listBtn = box.querySelector("#pg-list-btn")
    const listPanel = box.querySelector("#pg-list-panel")
    const listInner = box.querySelector("#pg-list-inner")
    const unblockSelectedBtn = box.querySelector("#pg-unblock-selected-btn")

    // 축소 버튼
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      box.classList.toggle("minimized")
      minimizeBtn.textContent = box.classList.contains("minimized") ? "＋" : "－"
    })

    // 투명도 조절
    opacitySlider.addEventListener("input", (e) => {
      box.style.opacity = e.target.value
    })

    // 드래그
    let isDragging = false
    let startX, startY, initialLeft, initialTop

    header.addEventListener("mousedown", (e) => {
      if (e.target === minimizeBtn) return
      isDragging = true
      startX = e.clientX
      startY = e.clientY

      const rect = box.getBoundingClientRect()
      initialLeft = rect.left
      initialTop = rect.top

      box.style.right = "auto"
      box.style.left = initialLeft + "px"
      box.style.top = initialTop + "px"
    })

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return
      e.preventDefault()
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      box.style.left = initialLeft + dx + "px"
      box.style.top = initialTop + dy + "px"
    })

    window.addEventListener("mouseup", () => {
      isDragging = false
    })

    // 차단 버튼: 이미 blocked 페이지이므로 알림만
    blockBtn.addEventListener("click", () => {
      alert("이미 차단된 페이지입니다.")
    })

    // 목록 버튼
    listBtn.addEventListener("click", async () => {
      if (listPanel.style.display === "none") {
        listPanel.style.display = "block"
        await loadMyBlockedUrls(listInner)
      } else {
        listPanel.style.display = "none"
      }
    })

    // 선택 해제
    unblockSelectedBtn.addEventListener("click", async () => {
      const checkboxes = listInner.querySelectorAll("input.pg-url-check:checked")
      if (!checkboxes.length) return

      const clientId = await getClientId()
      const tasks = []
      checkboxes.forEach((cb) => {
        const url = cb.dataset.url
        tasks.push(
          fetch(`${API_BASE}/remove-override`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: clientId, url }),
          }),
        )
      })
      await Promise.all(tasks)
      await loadMyBlockedUrls(listInner)
    })
  }

  async function loadMyBlockedUrls(container) {
    container.textContent = "로딩 중..."
    try {
      const clientId = await getClientId()
      const res = await fetch(`${API_BASE}/my-blocked-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      })
      const data = await res.json()

      container.innerHTML = ""
      const urls = data.urls || []
      if (!urls.length) {
        container.textContent = "차단 목록 없음"
        return
      }

      urls.forEach((url) => {
        const row = document.createElement("label")
        row.className = "pg-url-item"
        row.innerHTML = `
          <input type="checkbox" class="pg-url-check" data-url="${url}">
          <span title="${url}">${url}</span>
        `
        container.appendChild(row)
      })
    } catch (e) {
      container.textContent = "로드 실패"
    }
  }

  initFloating()
})()
