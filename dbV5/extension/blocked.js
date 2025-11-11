// blocked.js
(function () {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");
  const box = document.getElementById("reason");

  if (!box) return;

  if (reason) {
    box.textContent = decodeURIComponent(reason);
  } else {
    box.textContent = "명시된 차단 사유가 없습니다.";
  }
})();