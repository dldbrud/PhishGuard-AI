// ------------------------------------------------------
// [1] 핵심 분석 함수: DB 체크와 FastAPI 호출을 담당
// ------------------------------------------------------
async function runFullAnalysis(url, tabId) {
    // 함수가 반환할 기본 결과 객체입니다.
    let result = { ok: false, analysis: null };

    try {
        // --- 1. [1차 필터] FastAPI 서버에 URL이 이미 차단되었는지 확인 ---
        const dbCheckRes = await fetch("http://localhost:8000/check_blocked", {
            method: "POST", // HTTP POST 메서드 사용
            headers: { "Content-Type": "application/json" }, // 본문이 JSON 형식임을 알림
            body: JSON.stringify({ url }), // 분석할 URL을 JSON 문자열로 변환하여 전송
        });
        // fetch는 서버 오류(404, 500)가 나도 에러를 일으키지 않으므로, .ok (200~299)가 아닌지 직접 확인합니다.
        if (!dbCheckRes.ok) throw new Error(`DB 서버 응답 오류: ${dbCheckRes.status}`);

        // 서버 응답(JSON)을 JavaScript 객체로 변환합니다. (예: {blocked: true})
        const dbData = await dbCheckRes.json();

        // 🚨 DB에 이미 차단된 URL인 경우 (blocked: true)
        if (dbData.blocked) {
            console.warn("🚫 DB 등록 악성 URL:", url); // 콘솔에 경고 로그 출력
            const reason = "DB에서 이미 차단된 악성 사이트입니다."; // 차단 사유 정의
            // 팝업(popup.js)에 전달할 결과 객체에 '위험' 등급과 사유를 설정합니다.
            result.analysis = { rating: "위험", reason: reason };
            result.ok = false; // 'ok: false'는 1차 필터에서 차단되었음을 의미합니다.
            
            // (중요) tabId가 존재하는 경우, 즉 contentScript가 요청한 경우에만 오버레이와 탭 닫기를 실행합니다.
            // (팝업 요청(tabId=null) 시에는 탭을 닫지 않기 위함)
            if (tabId) {
                // contentScript.js에 'showOverlay' 명령을 보내 차단 오버레이를 띄웁니다.
                chrome.tabs.sendMessage(tabId, { action: "showOverlay", rating: "위험", reason: reason });
                // 0.1초(100ms) 후 background.js가 직접 해당 탭을 닫습니다.
                setTimeout(() => chrome.tabs.remove(tabId), 100);
            }
            // '위험' 결과를 반환하고 함수를 즉시 종료합니다. (2차 분석 불필요)
            return result;
        }

        // --- 2. [2차 필터] DB에 없다면 FastAPI에 정식 분석 요청 ---
        const analyzeRes = await fetch("http://localhost:8000/analyze_security", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });
        // 2차 분석 서버의 응답 상태도 확인합니다.
        if (!analyzeRes.ok) throw new Error(`분석 서버 응답 오류: ${analyzeRes.status}`);

        // 정식 분석 결과를 JSON 객체로 변환합니다. (예: {rating: "경고", score: 7, ...})
        const analysis = await analyzeRes.json();
        // 팝업에 전달할 결과 객체에 분석 결과를 저장합니다.
        result.analysis = analysis;
        result.ok = true; // 'ok: true'는 2차 분석이 성공적으로 완료되었음을 의미합니다.

        // (중요) contentScript가 요청한 경우(tabId 존재)에만 분석 결과에 따른 오버레이를 표시합니다.
        if (tabId) {
            // 분석 결과가 '위험'일 경우
            if (analysis.rating === "위험") {
                // '위험' 오버레이를 띄우고
                chrome.tabs.sendMessage(tabId, { action: "showOverlay", rating: "위험", reason: analysis.reason });
                // 0.1초 후 탭을 닫습니다.
                setTimeout(() => chrome.tabs.remove(tabId), 100);
            // 분석 결과가 '경고'일 경우
            } else if (analysis.rating === "경고") {
                // '경고' 오버레이만 띄웁니다.
                chrome.tabs.sendMessage(tabId, { action: "showOverlay", rating: "경고", reason: analysis.reason });
            }
        }
        // 정식 분석 결과를 반환합니다.
        return result;

    } catch (err) {
        // ❌ [서버 연결 실패] 1, 2차 필터 중 fetch() 자체가 실패한 경우 (네트워크 오류, localhost 서버 꺼짐 등)
        console.error("분석 실패 (서버 연결 문제일 가능성 높음):", err.message);
        // 보안을 위해, 분석 서버 접속 실패 시 '경고' 등급으로 간주합니다.
        const reason = "분석 서버에 연결할 수 없습니다. (테스트 시 서버 실행 필요)";
        result.analysis = { rating: "경고", score: 7, reason: reason };
        result.ok = false; // 분석이 성공하지 못했음을 알림

        // contentScript 요청이었을 경우(tabId 존재), '경고' 오버레이를 띄웁니다.
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { action: "showOverlay", rating: "경고", reason: reason });
        }
        // '경고' 결과를 반환합니다.
        return result;
    }
}


// ------------------------------------------------------
// [2] Message Listener (Content Script 및 Popup 요청 처리)
// ------------------------------------------------------
// 확장 프로그램 내부(contentScript, popup)에서 보내는 메시지를 수신 대기합니다.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // 🔔 [CASE 1] Content Script가 페이지 로드 시 보낸 요청인지 확인
    // request.action이 "analyzeUrl"이면 실행됩니다.
    if (request.action === "analyzeUrl") {
        // 비동기(async) 함수인 runFullAnalysis를 즉시 실행(IIFE)합니다.
        (async () => {
            // 핵심 분석 함수를 호출합니다. 이땐 'sender.tab.id' (요청을 보낸 탭 ID)를 함께 넘겨 오버레이/탭 닫기를 수행합니다.
            const result = await runFullAnalysis(request.url, sender.tab.id);
            // 분석 결과를 요청한 contentScript.js에 응답(response)으로 보냅니다.
            sendResponse(result);
        })(); 
        // (중요) 비동기 응답(sendResponse)을 유지하기 위해 true를 반환합니다.
        return true; 
    }


    // 🔔 [CASE 2] Popup이 열릴 때 현재 탭의 분석 결과를 요청
    // request.action이 "analyzePopupUrl"이면 실행됩니다.
    if (request.action === "analyzePopupUrl") {
        // 비동기(async) 함수를 즉시 실행(IIFE)합니다.
        (async () => {
            // 현재 활성화된(active) 창(currentWindow)의 탭 정보를 가져옵니다.
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            // 탭 정보(배열)의 첫 번째 항목에서 URL을 가져옵니다. (없으면 undefined)
            const url = tabs[0]?.url;

            // URL이 없는 경우 (예: 새 탭 페이지 'chrome://newtab/')
            if (!url) {
                // 분석할 URL이 없으므로 '안전'으로 간주하고 팝업에 응답합니다.
                sendResponse({ ok: false, analysis: { rating: "안전", reason: "현재 탭 URL을 가져올 수 없습니다." } });
                return; // 함수 종료
            }
            
            // (중요) 핵심 분석 함수를 호출합니다. 이땐 팝업창을 닫으면 안 되므로, tabId 자리에 'null'을 전달합니다.
            const result = await runFullAnalysis(url, null); 
            // 팝업(popup.js)에 분석 결과를 응답(response)으로 보냅니다.
            sendResponse(result);
        })();
        // (중요) 비동기 응답(sendResponse)을 유지하기 위해 true를 반환합니다.
        return true; 
    }

    // 🔔 [CASE 3] Popup이 '신고하기' 버튼을 눌러 보낸 요청인지 확인
    if (request.action === "reportUrl" && request.reportedUrl) {
        // 비동기(async) 함수를 즉시 실행(IIFE)합니다.
        (async () => {
            try {
                // FastAPI 서버의 /report_url 엔드포인트에 신고 데이터를 전송합니다.
                const reportRes = await fetch("http://localhost:8000/report_url", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        reported_url: request.reportedUrl, // 신고할 URL
                        suggested_url: request.suggestedUrl || null, // 교정 URL (없으면 null)
                    }),
                });

                // 서버의 신고 접수 결과(JSON)를 객체로 변환합니다.
                const reportData = await reportRes.json();
                // 팝업(popup.js)에 신고 성공 결과(reportData)를 응답으로 보냅니다.
                sendResponse({ ok: true, report: reportData });

            } catch (err) {
                // [서버 연결 실패] 신고 서버 접속에 실패한 경우
                console.error("Report submission failed:", err);
                // 팝업(popup.js)에 신고 실패 오류 메시지를 응답으로 보냅니다.
                sendResponse({ ok: false, error: "신고 서버에 연결할 수 없습니다. (테스트 시 서버 실행 필요)" });
            }
        })();
        // (중요) 비동기 응답(sendResponse)을 유지하기 위해 true를 반환합니다.
        return true; 
    }
});