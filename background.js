// [1] 탭 URL 로그(그대로 유지)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {   // 탭 업데이트 이벤트
  if (changeInfo.status === "complete" && tab.url) {              // 로드 완료 + URL 존재
    console.log("✅ 감지된 URL:", tab.url);                       // 디버깅용 로그
  }
});

// [2] contentScript → background: 분석 요청 수신 → FastAPI 호출 → 결과 회신 + 필요 시 오버레이 지시
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { // 다른 스크립트 메시지 수신
  if (request.action === "analyzeUrl") {                                   // 분석 요청만 처리
    const url = request.url;                                               // 전달된 URL

    fetch("http://localhost:8000/analyze_security", {                      // 백엔드 호출
      method: "POST",                                                      // POST 메서드
      headers: { "Content-Type": "application/json" },                     // JSON 헤더
      body: JSON.stringify({ url }),                                       // 바디에 URL
    })
      .then(async (res) => {                                               // 응답 처리
        if (!res.ok) throw new Error(`HTTP ${res.status}`);                // 에러 처리
        return res.json();                                                 // JSON 파싱
      })
      .then((analysis) => {                                                // 분석 결과(JSON)
        sendResponse({ ok: true, analysis });                              // 호출자에게 회신

        // 경고/위험이면 오버레이 표시 지시
        if ((analysis.rating === "경고" || analysis.rating === "위험") && sender?.tab?.id) { // 탭 확인
          chrome.tabs.sendMessage(sender.tab.id, {                         // 해당 탭으로 메시지
            action: "showOverlay",                                         // 오버레이 명령
            rating: analysis.rating,                                       // 등급
            reason: analysis.reason,                                       // 근거
          });
        }
      })
      .catch((err) => {                                                    // 실패한 경우
        console.error("분석 실패:", err.message);                          // 콘솔 에러
        sendResponse({                                                     // 기본 정책으로 응답
          ok: false,
          analysis: { rating: "경고", score: 7, reason: "분석 서버 응답 없음(기본 정책)" },
        });
      });

    return true;                                                           // 비동기 응답 유지
  }

  // [선택] 사용자 신고 수신 → /report_url 로 전달
  if (request.action === "reportUrl") {                                    // 신고 액션 처리
    fetch("http://localhost:8000/report_url", {                            // 백엔드 신고 API 호출
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reported_url: request.url,                                         // 신고 대상 URL
        suggested_url: request.suggestedUrl || null,                       // 교정 URL(선택)
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);                // 에러 처리
        return res.json();                                                 // JSON 파싱
      })
      .then((data) => sendResponse({ ok: true, message: data.message || "신고 접수" })) // 성공 회신
      .catch((err) => sendResponse({ ok: false, message: `신고 실패: ${err.message}` })); // 실패 회신

    return true;                                                           // 비동기 응답 유지
  }
});

// [3] 설치 시 FastAPI 연결 체크(선택)
chrome.runtime.onInstalled.addListener(() => {                              // 확장 설치 이벤트
  fetch("http://localhost:8000/")                                          // 루트 핑
    .then((r) => r.json())                                                 // JSON 파싱
    .then((d) => console.log("✅ FastAPI 연결 확인:", d))                  // 성공 로그
    .catch((e) => console.warn("⚠️ FastAPI 확인 실패:", e.message));       // 실패 경고
});
