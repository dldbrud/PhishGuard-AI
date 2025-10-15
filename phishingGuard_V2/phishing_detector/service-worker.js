// service-worker.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "PAGE_URL") {
    sendUrlToServer(msg.url).then(resText => {
      sendResponse({ status: "ok", resp: resText });
    }).catch(err => {
      sendResponse({ status: "fail", error: String(err) });
    });
    return true; // 비동기 응답을 위해 true 반환
  }
});

async function sendUrlToServer(url) {
  const server = "http://localhost:8080/api/report";
  const res = await fetch(server, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error("Server responded " + res.status);
  return await res.text();
}
