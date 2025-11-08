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

// ▼ background가 보낸 "오버레이 띄워" 명령을 수신
chrome.runtime.onMessage.addListener((request) => {        // 메시지 수신
  if (request.action === "showOverlay") {                  // 오버레이 명령이면
    showOverlay(request.rating, request.reason);           // 오버레이 렌더
  }
});

// ▼ 경고/차단 오버레이 DOM 생성
function showOverlay(rating, reason) {
  // 중복 방지
  if (document.getElementById('security-overlay-xyz')) return; // 이미 있다면 스킵

  const isDanger = (rating === "위험");                         // 위험 여부 플래그

  // 루트
  const overlay = document.createElement('div');                // 루트 div 생성
  overlay.id = 'security-overlay-xyz';                          // 고유 ID
  overlay.className = isDanger ? 'overlay-danger-xyz' : 'overlay-warning-xyz'; // 등급별 클래스

  // 내용
  overlay.innerHTML = `                                         // 중앙 박스 마크업
    <div class="overlay-box-xyz">
      <h1>${isDanger ? '접근 차단' : '주의 필요'}</h1>
      <p class="rating-text-xyz">${rating}</p>
      <p class="reason-text-xyz">${reason}</p>
      <button id="overlay-action-btn-xyz">${isDanger ? '닫기' : '무시하고 계속'}</button>
    </div>
  `;

  // DOM 삽입
  (document.body ? Promise.resolve() : new Promise(r => document.addEventListener('DOMContentLoaded', r)))
    .then(() => {                                              // body가 준비되면
      document.body.appendChild(overlay);                      // 오버레이 삽입

      // 버튼 동작
      const btn = document.getElementById('overlay-action-btn-xyz'); // 버튼 찾기
      if (btn) {
        btn.addEventListener('click', (e) => {                 // 클릭 핸들러
          e.stopPropagation();                                 // 이벤트 전파 중단
          if (isDanger) {
            overlay.remove();                                  // 위험: 닫기
          } else {
            overlay.remove();                                  // 경고: 무시 후 닫기
          }
        });
      }

      // 차단 시 스크롤 잠금(선택)
      if (isDanger) document.body.style.overflow = 'hidden';   // 스크롤 방지
    });
}
