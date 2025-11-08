# 🛡️ PhishGuard-AI

- OpenAI 기반 실시간 피싱 URL 탐지 및 차단 프로그램

# 📌 프로젝트 개요

- PhishGuard AI는 AI 분석을 활용해 URL의 위험도를 실시간 평가하고,
- 사용자 신고 및 학습을 통해 지속적으로 탐지 정확도를 높이는 지능형 보안 플랫폼이다.

✅ README.md
# 🔒 AI Web Security Extension (Frontend)

이 프로젝트는 **AI 기반 웹 보안 크롬 확장 프로그램의 프론트엔드 부분**입니다.  
페이지 접속 시 자동으로 URL을 감지하고, FastAPI 서버로 안전성 분석을 요청하여  
**위험/경고 사이트는 오버레이로 경고를 표시**합니다.

---

## 📁 프로젝트 구조

아래있는 파일들만 사용하면 됨 server, venv는 다 fastapi관련임

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

### 2️⃣ FastAPI 서버 실행 (백엔드 담당자 필요)

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
