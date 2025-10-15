// content-script.js
chrome.runtime.sendMessage({ type: "PAGE_URL", url: location.href }, response => {
  // 응답 처리(옵션)
  console.log("sent url to service worker", response);
});
