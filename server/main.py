# server/main.py
from fastapi import FastAPI, HTTPException        # FastAPI 본체와 에러 응답 타입 임포트
from pydantic import BaseModel                    # 요청/응답 바디 스키마 정의용
from fastapi.middleware.cors import CORSMiddleware# CORS 허용을 위한 미들웨어
from typing import Optional                       # Optional 타입(없을 수도 있는 필드)
import tldextract                                  # URL에서 도메인/서픽스 분해

app = FastAPI()                                   # FastAPI 애플리케이션 인스턴스 생성

# CORS: 확장프로그램에서 오는 요청 허용
app.add_middleware(                               # 미들웨어 등록
    CORSMiddleware,                               # CORS 미들웨어 사용
    allow_origins=["*"],        # 개발 단계: 모든 오리진 허용(배포시 특정 도메인만)
    allow_credentials=True,      # 쿠키/인증정보 포함 요청 허용
    allow_methods=["*"],         # 모든 HTTP 메서드 허용
    allow_headers=["*"],         # 모든 헤더 허용
)

# 요청/응답 모델
class AnalyzeReq(BaseModel):                      # 분석 요청 바디 스키마
    url: str                                      # 분석 대상 URL

class AnalyzeRes(BaseModel):                      # 분석 응답 바디 스키마
    rating: str        # "안전" | "경고" | "위험"   # 최종 등급
    score: int         # 0~10 (0 안전, 10 위험)     # 점수
    reason: str                                     # 근거 텍스트
    is_correction_needed: bool = False              # 교정 URL 제안 필요 여부
    suggested_url: Optional[str] = None             # 교정 URL (있으면 제공)

class ReportReq(BaseModel):                        # 신고 요청 바디 스키마
    reported_url: str                              # 신고된 URL
    suggested_url: Optional[str] = None            # (선택) 의심되는 원래 URL

@app.get("/")                                      # 헬스체크용 엔드포인트
def root():
    return {"message": "FastAPI is running successfully!"}  # 서버 동작 확인 메시지

@app.post("/analyze_security", response_model=AnalyzeRes)   # 분석 API
def analyze_security(payload: AnalyzeReq):
    url = payload.url                                         # 요청에서 URL 꺼냄

    # 아주 단순한 임시 로직(데모용): 도메인 기준 판정
    ext = tldextract.extract(url)                              # URL을 도메인/서픽스로 분해
    domain = f"{ext.domain}.{ext.suffix}" if ext.suffix else ext.domain  # 최종 도메인 문자열

    # 예시 규칙
    if domain in {"google.com", "github.com", "naver.com"}:   # 화이트리스트
        return AnalyzeRes(rating="안전", score=1, reason=f"{domain} 신뢰 도메인(데모)", is_correction_needed=False)
    elif "naver" in domain and domain != "naver.com":         # 유사 도메인(스쿼팅) 의심
        return AnalyzeRes(rating="경고", score=5, reason=f"{domain} 유사 도메인 의심(데모)", is_correction_needed=True, suggested_url="https://www.naver.com")
    else:                                                      # 그 외는 위험 처리
        return AnalyzeRes(rating="위험", score=9, reason=f"{domain} 알 수 없는 도메인(데모)")

@app.post("/report_url")                                      # 신고 API
def report_url(payload: ReportReq):
    # 여기서는 DB 없이 로그만 남김(팀원이 MySQL 붙일 때 이 엔드포인트 그대로 사용)
    print("---[REPORT]---")                                   # 서버 콘솔 로깅
    print("reported_url:", payload.reported_url)              # 신고 URL 출력
    print("suggested_url:", payload.suggested_url)            # 제안 URL 출력
    return {"status": "success", "message": "신고가 접수되었습니다.(demo)"}  # 단순 성공 응답
