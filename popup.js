// popup.js — safe, DOMContentLoaded-initialized popup behavior
// Communicates with background.js using actions: 'analyzePopupUrl' and 'reportUrl'

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('status-badge');
  const statusMessage = document.getElementById('status-message');
  const statusReason = document.getElementById('status-reason');
  const currentUrlElement = document.getElementById('current-url');
  const detailsSection = document.getElementById('details-section');
  const analysisDetails = document.getElementById('analysis-details');

  const scanButton = document.getElementById('scan-button');
  const reportButton = document.getElementById('report-button');

  let currentUrl = null;
  let currentAnalysis = null;

  if (scanButton) scanButton.addEventListener('click', handleRescanClick);
  if (reportButton) reportButton.addEventListener('click', handleReportClick);

  loadCurrentTabAndAnalyze();

  // --- functions ---
  function loadCurrentTabAndAnalyze() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        setStatus('error', '탭 정보를 가져올 수 없습니다.', chrome.runtime.lastError.message || '');
        return;
      }

      if (!tabs || !tabs.length) {
        setStatus('error', '활성 탭을 찾을 수 없습니다.', '');
        return;
      }

      const tab = tabs[0];
      currentUrl = tab.url || tab.pendingUrl || '';

      if (!currentUrl || currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://')) {
        if (currentUrlElement) currentUrlElement.textContent = '분석할 수 없는 페이지입니다.';
        setStatus('idle', '이 페이지는 분석할 수 없습니다.', '');
        return;
      }

      if (currentUrlElement) currentUrlElement.textContent = currentUrl;
      setStatus('pending', '분석 중...', '');

      requestAnalysis();
    });
  }

  function requestAnalysis() {
    chrome.runtime.sendMessage({ action: 'analyzePopupUrl' }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus('error', '통신 오류가 발생했습니다.', chrome.runtime.lastError.message || '');
        return;
      }

      if (!response) {
        setStatus('error', '서버 응답이 없습니다.', '');
        return;
      }

      if (response.analysis) {
        currentAnalysis = response.analysis;
        applyAnalysisResult(response.analysis);
      } else if (response.ok === false && !response.analysis) {
        setStatus('error', '분석 결과를 받을 수 없습니다.', '');
      } else {
        // Fallback — try to use any available analysis payload
        if (response.analysis) {
          currentAnalysis = response.analysis;
          applyAnalysisResult(response.analysis);
        } else {
          setStatus('error', '알 수 없는 응답입니다.', '');
        }
      }
    });
  }

  function applyAnalysisResult(analysis) {
    const { rating: rawRating, reason, score } = analysis || {};
    const rating = normalizeRating(rawRating);

    let statusType = 'idle';
    let statusText = '대기 중';
    let messageText = '';

    switch (rating) {
      case '안전':
        statusType = 'safe';
        statusText = '안전';
        messageText = '이 사이트는 안전합니다.';
        break;
      case '경고':
        statusType = 'warning';
        statusText = '경고';
        messageText = '이 사이트는 주의가 필요합니다.';
        break;
      case '위험':
        statusType = 'danger';
        statusText = '위험';
        messageText = '이 사이트는 위험합니다!';
        break;
      default:
        statusType = 'error';
        statusText = '알 수 없음';
        messageText = '분석 결과를 확인할 수 없습니다.';
        break;
    }

    setStatus(statusType, statusText, reason || messageText);

    // Build details area safely (avoid inserting untrusted HTML)
    if ((score !== undefined && score !== null) || reason) {
      if (analysisDetails) {
        // Clear
        while (analysisDetails.firstChild) analysisDetails.removeChild(analysisDetails.firstChild);
        if (score !== undefined && score !== null) {
          const p = document.createElement('p');
          const strong = document.createElement('strong');
          strong.textContent = '위험도 점수:';
          p.appendChild(strong);
          p.appendChild(document.createTextNode(' ' + score + '/10'));
          analysisDetails.appendChild(p);
        }
        if (reason) {
          const p2 = document.createElement('p');
          const strong2 = document.createElement('strong');
          strong2.textContent = '사유:';
          p2.appendChild(strong2);
          p2.appendChild(document.createTextNode(' ' + reason));
          analysisDetails.appendChild(p2);
        }
      }
      if (detailsSection) detailsSection.style.display = 'block';
    } else {
      if (detailsSection) detailsSection.style.display = 'none';
    }
  }

  function normalizeRating(r) {
    if (!r && r !== 0) return r;
    const s = String(r).trim().toLowerCase();
    if (s === 'danger' || s === '위험') return '위험';
    if (s === 'warning' || s === '경고') return '경고';
    if (s === 'safe' || s === '안전') return '안전';
    // If already a localized label, return as-is with capitalization
    if (s === '안전' || s === '경고' || s === '위험') return s;
    return r;
  }

  function setStatus(status, message, reason) {
    if (!statusBadge) return;
    // reset class but keep other unrelated classes
    const baseClasses = Array.from(statusBadge.classList).filter(c => !c.startsWith('status--'));
    statusBadge.className = baseClasses.join(' ');
    statusBadge.classList.add('status--' + (status || 'idle'));

    switch (status) {
      case 'pending': statusBadge.textContent = '검사 중'; break;
      case 'danger': statusBadge.textContent = '위험'; break;
      case 'warning': statusBadge.textContent = '경고'; break;
      case 'safe': statusBadge.textContent = '안전'; break;
      case 'error': statusBadge.textContent = '오류'; break;
      default: statusBadge.textContent = '대기 중';
    }

    if (statusMessage) statusMessage.textContent = message || '';
    if (statusReason) statusReason.textContent = reason || '';
  }

  function handleRescanClick() {
    if (!currentUrl) { setStatus('error', 'URL 정보가 없습니다.', ''); return; }
    setStatus('pending', '다시 분석 중...', '');
    requestAnalysis();
  }

  function handleReportClick() {
    if (!currentUrl) { setStatus('error', '신고할 URL이 없습니다.', ''); return; }
    const confirmed = confirm('다음 URL을 신고하시겠습니까?\n\n' + currentUrl);
    if (!confirmed) return;
    setStatus('pending', '신고 처리 중...', '');

    chrome.runtime.sendMessage({ action: 'reportUrl', reportedUrl: currentUrl, suggestedUrl: null }, (response) => {
      if (chrome.runtime.lastError) { setStatus('error', '신고 처리 중 오류가 발생했습니다.', chrome.runtime.lastError.message || ''); return; }
      if (!response) { setStatus('error', '신고 서버 응답이 없습니다.', ''); return; }
      if (response.ok) {
        setStatus('safe', '신고가 접수되었습니다.', (response.report && response.report.message) || '감사합니다.');
        try { alert('신고가 성공적으로 접수되었습니다.'); } catch (e) {}
      } else {
        setStatus('error', '신고 처리에 실패했습니다.', (response.report && response.report.message) || '다시 시도해주세요.');
      }
    });
  }

});

