// [2] contentScript → background: 분석 요청 수신 → DB 선차단 검사 → FastAPI 호출 → 결과 회신 + 필요 시 오버레이/차단
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeUrl") {
    const url = request.url;

    // [1️⃣] 1차 필터: DB에 이미 차단된 URL인지 확인
    fetch("http://localhost:8000/check_blocked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then((res) => res.json())
      .then((data) => {
        // ✅ [DB 차단됨] 바로 차단 (오버레이 없이 즉시 페이지 차단)
        if (data.blocked) {
          console.warn("🚫 DB에 등록된 악성 URL 접근 시도:", url);

          if (sender?.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "showOverlay",
              rating: "위험",
              reason: "DB에서 이미 차단된 악성 사이트입니다.",
              immediateClose: true, // contentScript에서 window.close() 트리거용
            });
          }

          sendResponse({
            ok: false,
            analysis: {
              rating: "위험",
              reason: "DB에서 이미 차단된 악성 사이트입니다.",
            },
          });
          return; // 여기서 종료
        }

        // [2️⃣] DB에 없는 경우에만 FastAPI /analyze_security 호출
        return fetch("http://localhost:8000/analyze_security", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
      })
      .then((res) => res && res.json()) // DB 차단 시 null 반환 방지
      .then((analysis) => {
        if (!analysis) return; // DB 차단 시 종료됨

        // 팝업/contentscript에 전달
        sendResponse({ ok: true, analysis });

        // [3️⃣] 분석 결과별 조치
        if (sender?.tab?.id) {
          if (analysis.rating === "위험") {
            // 즉시 차단 (탭 닫기)
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "showOverlay",
              rating: "위험",
              reason: analysis.reason,
              immediateClose: true, // contentScript.js에서 닫기 명령
            });
          } else if (analysis.rating === "경고") {
            // 경고: 오버레이만 띄움
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "showOverlay",
              rating: "경고",
              reason: analysis.reason,
              immediateClose: false,
            });
          }
        }
      })
      .catch((err) => {
        // [4️⃣] FastAPI 서버 오류 → 기본 정책 적용
        console.error("분석 실패:", err.message);
        sendResponse({
          ok: false,
          analysis: { rating: "경고", score: 7, reason: "분석 서버 응답 없음(기본 정책)" },
        });
      });

    return true; // 비동기 응답 유지
  }
});
