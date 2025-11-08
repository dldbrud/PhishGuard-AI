// [2] contentScript → background: 분석 요청 수신 (Async/Await 버전)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeUrl") {
    const url = request.url;
    const tabId = sender?.tab?.id; // 탭 ID 미리 저장

    // 비동기 처리를 위해 즉시 함수 실행 (IIFE)
    (async () => {
      try {
        // [1️⃣] 1차 필터: DB에 이미 차단된 URL인지 확인
        const dbCheckRes = await fetch("http://localhost:8000/check_blocked", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        // fetch는 404/500 에러를 throw하지 않으므로, .ok로 체크
        if (!dbCheckRes.ok) throw new Error(`DB 서버 응답 오류: ${dbCheckRes.status}`);
        
        const dbData = await dbCheckRes.json();

        // ✅ [DB 차단됨]
        if (dbData.blocked) {
          console.warn("🚫 DB 등록 악성 URL:", url);
          const reason = "DB에서 이미 차단된 악성 사이트입니다.";

          sendResponse({ ok: false, analysis: { rating: "위험", reason: reason } });

          if (tabId) {
            // 1. 오버레이 띄우라고 ContentScript에 명령 (보여줄 시간 확보)
            chrome.tabs.sendMessage(tabId, {
              action: "showOverlay",
              rating: "위험",
              reason: reason,
            });
            // 2. (중요) Background가 직접 탭을 닫음 (0.1초 딜레이 후)
            setTimeout(() => chrome.tabs.remove(tabId), 100);
          }
          return; // 비동기 함수 종료
        }

        // [2️⃣] DB에 없는 경우 FastAPI /analyze_security 호출
        const analyzeRes = await fetch("http://localhost:8000/analyze_security", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!analyzeRes.ok) throw new Error(`분석 서버 응답 오류: ${analyzeRes.status}`);

        const analysis = await analyzeRes.json();

        // 팝업/contentscript에 전달
        sendResponse({ ok: true, analysis });

        // [3️⃣] 분석 결과별 조치
        if (tabId) {
          if (analysis.rating === "위험") {
            chrome.tabs.sendMessage(tabId, {
              action: "showOverlay",
              rating: "위험",
              reason: analysis.reason,
            });
            // (중요) Background가 직접 탭을 닫음 (0.1초 딜레이)
            setTimeout(() => chrome.tabs.remove(tabId), 100);

          } else if (analysis.rating === "경고") {
            // 경고: 오버레이만 띄움
            chrome.tabs.sendMessage(tabId, {
              action: "showOverlay",
              rating: "경고",
              reason: analysis.reason,
            });
          }
        }
      } catch (err) {
        // [4️⃣] FastAPI 서버 오류 또는 네트워크 오류 → 기본 정책 적용
        console.error("분석 실패:", err.message);
        const reason = "분석 서버에 연결할 수 없습니다. 사이트 접속에 유의하세요.";
        sendResponse({
          ok: false,
          analysis: { rating: "경고", score: 7, reason: "분석 서버 응답 없음(기본 정책)" },
        });

        // 서버 오류 시에도 경고 오버레이를 띄워줍니다.
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            action: "showOverlay",
            rating: "경고",
            reason: reason,
          });
        }
      }
    })(); // 비동기 함수 즉시 실행

    return true; // 비동기 응답 유지
  }
});