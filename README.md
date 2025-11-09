@ -6,91 +6,3 @@
README.md
---

## 📁 프로젝트 구조

아래있는 파일들만 사용하면 됨 추가로 해야할점 popup.js , html, css

extension/
+ background.js # 백엔드 서버와 통신, 정책 판단
+ contentScript.js # 웹페이지 감시, 오버레이 표시
+ overlay.css # 경고/차단 UI 스타일
+ manifest.json # 확장 설정 및 권한 정의
+ icon.png # 확장 아이콘


---

## 🚀 사용 방법

### 1️⃣ Chrome 확장 프로그램 로드

1. Chrome 주소창에 `chrome://extensions` 입력  
2. 우측 상단에서 **[개발자 모드]** ON  
3. **[압축 해제된 확장 프로그램을 로드]** 클릭  
4. 이 저장소의 `extension/` 폴더 선택  

> 성공 시 확장 아이콘이 브라우저 우측 상단에 표시됩니다.

---

### 2️⃣ FastAPI 서버 실행 (백엔드 담당자 필요) -->나중에 할일 fastapi랑 합칠때 내용

확장은 `http://localhost:8000` 주소로 FastAPI 서버와 통신합니다.  
서버를 실행하지 않으면 분석 요청이 실패합니다.

#### 예시 (팀원이 실행해야 할 서버 코드)
```bash
cd server
uvicorn main:app --reload

정상 동작 확인

브라우저에서 아래 주소 접속:

http://127.0.0.1:8000/


결과:

{"message": "FastAPI is running successfully!"}

⚙️ 주의사항

background.js는 localhost:8000 기준으로 서버 요청을 보냅니다.
포트나 도메인이 다르면 내부 주소를 수정해야 합니다.

FastAPI 서버와 확장 프로그램은 같은 PC에서 실행해야 합니다.

이 저장소는 프론트엔드(확장) 코드만 포함하며,
백엔드(FastAPI + MySQL) 코드는 별도 저장소에서 관리합니다.

🧩 기술 스택
구성	기술
확장 플랫폼	Chrome Extension (Manifest v3)
백엔드 통신	Fetch API
서버 언어	FastAPI (Python)
데이터베이스	MySQL (외부팀)
🧠 개발 참고

확장 자동 감지 흐름:

contentScript.js → background.js → FastAPI 서버 → background.js → contentScript.js (오버레이 표시)


👥 팀 협업 시 주의

백엔드 담당자는 FastAPI 엔드포인트(/analyze_security, /report_url)를 구현해야 합니다.

프론트엔드 담당자는 background.js의 fetch 호출이 정상 동작하는지만 확인하면 됩니다.

FastAPI가 꺼져 있으면 “분석 서버 응답 없음(기본 정책)” 메시지가 표시됩니다.

제목: [Background] 1차 완료 (팝업 연동 API 준비)

background.js, contentScript.js, overlay.css, manifest.json 4개 파일 업로드합니다.

contentScript랑 overlay.css는 페이지에 경고창 띄우는 용도라서, 팝업 쪽에서는 신경 쓰지 않으셔도 됩니다.

가장 중요한 건 background.js입니다. 팝업(popup.js)이 실제 데이터를 얻으려면 background.js와 통신해야 합니다. 제가 통신 API를 미리 만들어 두었습니다.

popup.js에서는 chrome.runtime.sendMessage를 사용해 아래처럼 요청만 보내주시면 됩니다.

1. 현재 탭 분석 결과 요청 (팝업 켰을 때)
팝업 창이 열릴 때 이 메시지를 보내서 현재 페이지의 rating과 reason을 받아가세요.

JavaScript

// popup.js에서 사용 (콘솔창 알리기 용)
chrome.runtime.sendMessage({ action: "analyzePopupUrl" }, (response) => {
  if (response && response.analysis) {
    // response.analysis.rating (예: "경고")
    // response.analysis.reason (예: "서버 연결 실패...")
    // 이 데이터로 팝업 UI를 업데이트해주세요.
    console.log(response.analysis);
  }
});
2. URL 신고하기 (팝업의 신고 버튼 클릭 시)
신고 기능이 필요하면 이 메시지를 보내주세요.

JavaScript

// popup.js에서 사용
chrome.runtime.sendMessage(
  {
    action: "reportUrl",
    reportedUrl: "http://phishing-site.com", // 현재 탭 URL
    suggestedUrl: null // (선택) 교정 URL
  },
  (response) => {
    // response.report.message (예: "신고가 접수되었습니다.")
    // 이 데이터로 "신고 완료" 같은 알림을 띄워주세요.
    console.log(response);
  }
);
⭐️ 가장 중요한 것: 서버(Localhost) 테스트
background.js는 http://localhost:8000에 접속을 시도합니다.

팀원분은 서버가 없으니 당연히 연결이 실패할 텐데, 이게 정상입니다! (시도하려면 fastAPi깔아서 집적 시연해보면 됨 fetch사용)

제가 background.js에서 이 오류를 잡아서, rating: "경고", reason: "분석 서버에 연결할 수 없습니다..." 같은 **경고용 응답(JSON)**을 보내도록 설정해 뒀습니다.

팝업 테스트하실 땐, 이 '경고' 메시지가 팝업에 잘 표시되는지 위주로 UI 확인해 주시면 됩니다.

안전이나 위험 UI가 잘 나오는지 보려면, 제가 서버를 켜고 테스트하거나 아니면 popup.js에서 임시로 JSON 데이터를 만들어서 테스트해보시면 됩니다.

막히는 거 있으면 바로 알려주세요!

popup에 들어가야하는 내용 
1.점수 
2.url 올바르게 가게 해주는 기능
3.신고버튼
4.안전이면 안뜨고 popup창 안뜨고, 위험시 overlay.css가 버튼 누르지 않는이상 다음페이지로 안넘어가게함(popup창은뜨게 해줘서 url이랑 점수 보여야함), 경고시 경고 팝업이랑 바로 차단(이부분 애매함 잘 어떻게 하기로 했는지 기억안남 전페이지로 돌아가게 하던지 그냥 아예 못 들어가게 막아놔도 될듯 이때 blocked 쌓임)


fastapi내용 필요하면 줌 (나도 봐도 모름) 설치방법은 gpt한테
솔직히 봐도 모르겠음 좀 더 알아봐야할듯 거의 gemini한테 맡김
현재 background.js는 fastapi없어도 돌아가는 상태로 만들긴함