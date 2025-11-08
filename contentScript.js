// ▼ 페이지가 로드되자마자 현재 URL을 background에 전달해 '분석' 요청
try {
  chrome.runtime.sendMessage(                               // 백그라운드로 메시지 전송
    { action: "analyzeUrl", url: window.location.href },   // 현재 페이지 URL 포함
    (response) => {                                        // (선택) 응답 콜백
      // 응답은 팝업에서 쓰거나 디버깅용으로 활용 가능
      // console.log("background 응답:", response);
    }
  );
} catch (e) {
  // 확장 리로드 직후 race condition 대비
  // console.warn("메시지 전송 실패(무시 가능):", e);
}

/* ------------------------------------------------------------------
   ▼ background가 보낸 "오버레이 띄워" 명령 수신
      - 위험/경고 여부에 따라 오버레이 표시
      - 위험 + immediateClose 플래그가 true면 일정 시간 후 탭 자동 종료
------------------------------------------------------------------ */
chrome.runtime.onMessage.addListener((request) => {        
  if (request.action === "showOverlay") {                  // background.js → showOverlay 명령
    showOverlay(request.rating, request.reason);           // 오버레이 렌더링

    // 🔥 추가된 로직: "즉시 닫기" 플래그가 true이고 위험 등급일 경우 자동 차단
    if (request.immediateClose && request.rating === "위험") {
      setTimeout(() => {
        window.close();                                    // 현재 탭 닫기
      }, 2000);                                            // 약간의 지연 후 (2초) 닫기
    }
  }
});

/* ------------------------------------------------------------------
   ▼ 경고/차단 오버레이 DOM 생성
      - 위험이면 '접근 차단', 경고면 '주의 필요'
      - 버튼 클릭 시 오버레이 닫기 / 무시하기
------------------------------------------------------------------ */
function showOverlay(rating, reason) {
  if (document.getElementById('security-overlay-xyz')) return; // 중복 방지

  const isDanger = (rating === "위험");

  const overlay = document.createElement('div');
  overlay.id = 'security-overlay-xyz';
  overlay.className = isDanger ? 'overlay-danger-xyz' : 'overlay-warning-xyz';

  overlay.innerHTML = `
    <div class="overlay-box-xyz">
      <h1>${isDanger ? '접근 차단' : '주의 필요'}</h1>
      <p class="rating-text-xyz">${rating}</p>
      <p class="reason-text-xyz">${reason}</p>
      <button id="overlay-action-btn-xyz">${isDanger ? '닫기' : '무시하고 계속'}</button>
    </div>
  `;

  // body 준비 여부 확인 후 DOM 삽입
  (document.body ? Promise.resolve() : new Promise(r => document.addEventListener('DOMContentLoaded', r)))
    .then(() => {
      document.body.appendChild(overlay);

      // 버튼 클릭 이벤트
      const btn = document.getElementById('overlay-action-btn-xyz');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          overlay.remove();                                // 경고든 위험이든 클릭 시 닫기
        });
      }

      // 위험일 경우 스크롤 잠금
      if (isDanger) document.body.style.overflow = 'hidden';
    });
}
