(function () {
  // 1. URL 파라미터 읽기
  const params = new URLSearchParams(window.location.search);
  const reasonRaw = params.get("reason");
  const blockedUrl = params.get("blocked_url");

  // 2. DOM 요소 연결
  const scoreEl = document.getElementById("display-score");
  const levelEl = document.getElementById("display-level");
  const gsbEl = document.getElementById("gsb-result");
  const geminiEl = document.getElementById("gemini-result");

  // 3. 초기값 설정 및 파싱
  let score = 90;
  let gsbText = "탐지되지 않음 (Safe)";
  let geminiText = "상세 사유 없음";

  if (reasonRaw) {
    const decoded = decodeURIComponent(reasonRaw);

    // 점수 추출
    const scoreMatch = decoded.match(/Score:\s*(\d+)/);
    if (scoreMatch) {
      score = parseInt(scoreMatch[1], 10);
    }

    // GSB 탐지 여부 확인
    if (decoded.includes("GSB_") || decoded.includes("MALWARE") || decoded.includes("SOCIAL_ENGINEERING")) {
      gsbText = "🚨 악성/피싱 사이트 DB 매칭됨 (위험)";
      score = 100;
    } else {
      gsbText = "✅ Google DB에서 발견되지 않음";
    }

    // Gemini AI 분석 내용 정제
    if (decoded.includes("Reason:")) {
      const parts = decoded.split("Reason:");
      if (parts.length > 1) {
        geminiText = parts[1].replace(")", "").trim();
      } else {
        geminiText = decoded;
      }
    } else if (decoded.includes("USER_REPORTED")) {
      geminiText = "사용자 신고 누적으로 인해 차단되었습니다.";
    } else {
      geminiText = decoded
        .replace("GEMINI_HIGH_RISK", "AI가 고위험 피싱 패턴을 감지했습니다.")
        .replace("GEMINI_SUSPICIOUS", "AI가 의심스러운 패턴을 발견했습니다.");
    }
  }

  // 4. 화면 업데이트
  if (scoreEl && levelEl) {
    scoreEl.textContent = `${score}점`;
    
    if (score >= 80) {
      levelEl.textContent = "(심각한 위험)";
      scoreEl.style.color = '#fff'; // Red card, so white text
    } else {
      levelEl.textContent = "(주의 요망)";
    }

    if (gsbEl) gsbEl.textContent = gsbText;
    if (geminiEl) geminiEl.textContent = geminiText;
  }
})();