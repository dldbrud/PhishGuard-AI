README.md
---

## 📁 프로젝트 구조

extension/
+ background.js # 백엔드 서버와 통신, 정책 판단
+ contentScript.js # 웹페이지 감시, 오버레이 표시
+ overlay.css # 경고/차단 UI 스타일
+ manifest.json # 확장 설정 및 권한 정의
+ icon.png # 확장 아이콘


---

## 🚀 사용 방법

### 1️⃣ Chrome 확장 프로그램 로드

1. Chrome 주소창에 `chrome://extensions`(확장 프로그램) 입력  
2. 우측 상단에서 **[개발자 모드]** ON  
3. **[압축 해제된 확장 프로그램을 로드]** 클릭  
4. 이 저장소의 PhishGuard-AI\dbV10에 있는 `extension/` 폴더 선택  

> 성공 시 확장 아이콘이 브라우저 우측 상단에 표시됩니다.

---

### 2️⃣ FastAPI 서버 실행

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

---
### 🔒 PhishGuard-AI 주요 세부 기능 요약

 + AI 기반 피싱 사이트 탐지 및 차단 (Google Gemini, Safe Browsing API 활용)
 + 실시간 URL 분석 및 위험 등급(안전/경고/위험) 판정
 + 사용자별 차단/허용 목록 관리
 + 크롬 확장 프로그램 UI(차단, 차단 목록, 분석하기 버튼)
 + 분석 결과 캐싱(24시간)
 + 관리자/사용자별 통계 및 로그 관리
 + MySQL 연동 및 FastAPI 서버 운영
