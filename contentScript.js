// ▼ 페이지가 로드되자마자 현재 URL을 background에 전달해 '분석' 요청
try {
  chrome.runtime.sendMessage(
    { action: "analyzeUrl", url: window.location.href },
    (response) => {
      // console.log("background 응답:", response);
    }
  );
} catch (e) {
  // console.warn("메시지 전송 실패(무시 가능):", e);
}

/* ------------------------------------------------------------------
    ▼ background가 보낸 "오버레이 띄워" 명령 수신
------------------------------------------------------------------ */
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "showOverlay") {
    // 🛡️ XSS가 패치되고, window.close()가 제거된 새 함수 호출
    showOverlay_Safe(request.rating, request.reason);

    // 🔥 [삭제됨] "즉시 닫기" 로직은 background.js가 처리하므로
    // contentScript에서는 관련 코드가 모두 필요 없습니다.
  }
});

/* ------------------------------------------------------------------
    ▼ 경고/차단 오버레이 DOM 생성 (XSS 방지)
------------------------------------------------------------------ */
function showOverlay_Safe(rating, reason) {
  if (document.getElementById('security-overlay-xyz')) return; // 중복 방지

  const isDanger = (rating === "위험");

  // --- 🛡️ XSS 패치: innerHTML 대신 DOM 요소를 직접 생성 ---
  const overlay = document.createElement('div');
  overlay.id = 'security-overlay-xyz';
  overlay.className = isDanger ? 'overlay-danger-xyz' : 'overlay-warning-xyz';

  const box = document.createElement('div');
  box.className = 'overlay-box-xyz';

  const h1 = document.createElement('h1');
  h1.textContent = isDanger ? '접근 차단' : '주의 필요'; // textContent 사용

  const pRating = document.createElement('p');
  pRating.className = 'rating-text-xyz';
  pRating.textContent = rating; // textContent 사용

  const pReason = document.createElement('p');
  pReason.className = 'reason-text-xyz';
  pReason.textContent = reason; // textContent 사용 (가장 중요)

  const btn = document.createElement('button');
  btn.id = 'overlay-action-btn-xyz';
  btn.textContent = isDanger ? '닫기' : '무시하고 계속'; // textContent 사용

  // 요소 조립
  box.appendChild(h1);
  box.appendChild(pRating);
  box.appendChild(pReason);
  box.appendChild(btn);
  overlay.appendChild(box);
  // --- XSS 패치 완료 ---

  // body 준비 여부 확인 후 DOM 삽입
  (document.body ? Promise.resolve() : new Promise(r => document.addEventListener('DOMContentLoaded', r)))
    .then(() => {
      document.body.appendChild(overlay);

      // 버튼 클릭 이벤트
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        overlay.remove();
        
        // "경고" 등급일 때 닫은 후, 잠겼던 스크롤을 다시 풀어줌
        if (!isDanger) {
          document.body.style.overflow = 'auto';
        }
        // "위험" 등급일 때는 어차피 탭이 닫힐 것이므로 버튼 클릭은 큰 의미 없음
      });

      // 페이지 스크롤 잠금 (위험/경고 모두)
      document.body.style.overflow = 'hidden';
    });
}