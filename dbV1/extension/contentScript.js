(() => {
  try {
    const url = window.location.href;
    chrome.runtime.sendMessage({ type: "CHECK_URL", url });
  } catch (e) {
    // content script 안전성
  }
})();
