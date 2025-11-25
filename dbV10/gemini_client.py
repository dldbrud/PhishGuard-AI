import httpx
import os
import json
from dotenv import load_dotenv

# .env 로드
load_dotenv()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")


async def analyze_url_with_gemini(url: str, client: httpx.AsyncClient) -> dict:
    """
    Gemini API를 호출하여 URL의 문맥적 위험도를 분석합니다.
    - JSON 응답 형식 강제
    - reason은 한국어
    - suggested_url은 항상 http(s):// 로 시작하는 전체 URL이 되도록 유도
    """
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY가 .env에 설정되지 않았습니다.")

    # Gemini 2.5 Flash 모델 사용
    api_url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    )

    prompt = f"""
    당신은 세계 최고의 피싱 사이트 및 악성 사이트 탐지 보안 전문가 AI입니다. 
    다음 URL을 정밀 분석하고 결과를 요청한 JSON 형식으로만 응답해 주세요.

    [중요 요청사항]
    1. 분석 결과에 대한 설명(reason)은 반드시 '한국어(Korean)'로 작성해 주세요.
    2. 전문적인 보안 용어는 사용하되, 설명은 비전공자도 이해하기 쉽게 명확하게 작성하세요.
    3. JSON 형식을 엄격하게 지키고, JSON 이외의 텍스트는 절대 포함하지 마세요.
    4. suggested_url 필드는 항상 전체 URL 형식으로 반환해 주세요.
       - 가능하면 "https://도메인" 형태로 작성하세요.
       - 예: "https://naver.com", "https://www.google.com"
       - 도메인만 알고 있다면 "https://"를 붙여서 전체 URL로 만들어 주세요.

    [분석 기준]
    1. score: 피싱/악성 사이트 의심 점수 (0~100) 
       - 0~20: 매우 안전 (공식 사이트, 정부 기관 등)
       - 21~40: 낮은 위험 (일반 웹사이트)
       - 41~60: 중간 위험 (의심스러운 요소 존재)
       - 61~80: 높은 위험 (피싱/악성 사이트 가능성 높음)
       - 81~100: 매우 위험 (확실한 피싱/악성 사이트)
       
    2. is_typosquatting: 유명 사이트를 교묘하게 모방한 오타 도메인인지 (true/false)
    
    3. suggested_url: is_typosquatting이 true일 경우, 사용자가 원래 접속하려 했던 공식 URL.
       - 공식 URL을 알고 있다면 "https://..." 형식의 전체 URL로 작성하세요.
       - 공식 URL을 추정하기 어렵다면 null로 두세요.
    
    4. reason: 해당 점수를 부여한 구체적인 근거 및 분석 내용을 간략하게 설명
       - 반드시 한국어로 작성
       - 어떤 기준(카테고리/패턴)에 의해 점수가 올라갔는지 명확히 언급

    [종합 악성 사이트 탐지 기준]
    다음 모든 유형의 피싱/악성 사이트를 종합적으로 분석하여 점수를 산정하세요:
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 1: 오타 도메인 피싱 (Typosquatting)
    ═══════════════════════════════════════════════════════════════
    # 주요 사이트 목록 (반드시 숙지)
    - 한국: naver.com, daum.net, kakao.com, coupang.com, 11st.co.kr, gmarket.co.kr, 
            kbstar.com, ibk.co.kr, shinhan.com, hanabank.com, wooribank.com
    - 글로벌: google.com, facebook.com, amazon.com, paypal.com, apple.com, microsoft.com,
             netflix.com, twitter.com, instagram.com, linkedin.com, youtube.com
    
    # 오타 패턴 (이런 패턴은 즉시 높은 점수 부여)
    - 문자 중복: navver.com (naver → navver) → +50~70점
    - 문자 교체: naber.com (naver → naber, v→b) → +50~70점
    - 문자 누락: gogle.com (google → gogle) → +50~70점
    - 유사 문자 혼용: goog1e.com (l→1) → +60~80점
    - 하이픈 삽입: pay-pal.com → +40~60점
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 2: 불법 도박 사이트
    ═══════════════════════════════════════════════════════════════
    # 도메인 키워드 탐지 (+40~60점)
    - 도박 관련: bet, casino, poker, slot, baccarat, roulette, gamble, wagering
    - 한국어: 토토, 배팅, 카지노, 슬롯, 포커, 바카라, 사다리, 파워볼
    - 조합 패턴: bet365, 1xbet, betmgm, casinoX, slot777 등
    
    # 콘텐츠 특징 (+20~40점)
    - 과도한 보너스/이벤트 홍보 ("첫 충전 100% 보너스", "무제한 환전")
    - 입금/환전 강조 문구
    - 불법 스포츠 베팅 광고
    - 해외 라이센스 과도한 강조
    
    # 기술적 특징 (+15~25점)
    - 빈번한 도메인 변경 (숫자 버전: bet123.com → bet456.com)
    - 의심스러운 TLD 사용 (.tk, .ml, .ga, .xyz)
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 3: 불법 성인 콘텐츠 사이트
    ═══════════════════════════════════════════════════════════════
    # 도메인 키워드 탐지 (+40~60점)
    - 성인 콘텐츠: porn, xxx, sex, adult, hentai, nsfw, erotic
    - 한국어: 야동, 19금, 성인, 몰카, 도촬, 불법촬영
    - 조합 패턴: xxxvideos, pornhub-copy, adult123 등
    
    # 콘텐츠 특징 (+30~50점)
    - 불법 촬영물 유포 의심 문구
    - 미성년자 접근 제한 없음
    - 과도한 팝업/리다이렉트
    - 연령 확인 없이 즉시 노출
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 4: 금융 피싱 사이트
    ═══════════════════════════════════════════════════════════════
    # 은행/금융 사칭 (+50~70점)
    - 정식 은행 도메인이 아닌데 로그인 요구
    - "계좌 정지", "본인 확인 필요" 등 긴급성 유도
    - 카드번호, 비밀번호, OTP 직접 입력 요구
    - URL이 정식 은행 도메인과 1~3글자 차이
    
    # 가짜 결제 페이지 (+40~60점)
    - PayPal, Stripe 등 결제 서비스 사칭
    - SSL 인증서 없이 카드 정보 요구
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 5: 사기/스캠 사이트
    ═══════════════════════════════════════════════════════════════
    # 가짜 경품/이벤트 (+35~55점)
    - "iPhone 무료 증정", "100만원 당첨" 등 과장 문구
    - 개인정보 입력 후 아무 것도 제공하지 않음
    - 공유/광고 클릭 강요
    
    # 피라미드/다단계 (+40~60점)
    - "하루 10분 투자로 월 500만원"
    - "친구 초대 시 50만원 지급"
    - 불명확한 수익 구조
    
    # 가짜 쇼핑몰 (+30~50점)
    - 비정상적으로 낮은 가격 (시세의 50% 이하)
    - 연락처/사업자 정보 없음
    - 선입금 요구 후 물건 미발송
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 6: 악성코드/바이러스 사이트
    ═══════════════════════════════════════════════════════════════
    # 자동 다운로드 (+50~70점)
    - 사용자 동의 없이 파일 자동 다운로드
    - 의심스러운 실행 파일 (.exe, .apk, .dmg)
    - "플래시 업데이트 필요" 등 거짓 알림
    
    # 브라우저 공격 (+40~60점)
    - 무한 팝업/리다이렉트 체인
    - 브라우저 잠금 ("바이러스 감염" 거짓 경고)
    - 클립보드 탈취 시도
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 7: URL 구조 기반 탐지
    ═══════════════════════════════════════════════════════════════
    # URL 구조 분석
    - URL 길이 비정상: 100자 이상 (+10~20점)
    - 특수문자 과다: 하이픈/언더스코어 5개 이상 (+15~25점)
    - 숫자 혼합: 도메인에 숫자 3개 이상 (+20~30점)
    - IP 주소 직접 사용: http://192.168.x.x (+30~40점)
    - 서브도메인 과다: 3단계 이상 중첩 (+20~30점)
    - 의심스러운 TLD: .tk, .ml, .ga, .cf, .gq (+25~35점)
    
    # HTTPS 및 보안
    - HTTPS 미사용하면서 개인정보 요구 (+20~30점)
    - SSL 인증서 만료/무효 (+15~25점)
    
    ═══════════════════════════════════════════════════════════════

    [종합 판단 기준]
    - 여러 카테고리에 해당되면 점수를 누적하여 score를 계산하세요.
    - 명백한 공식 사이트는 0~20점.
    - 의심스러운 요소가 2개 이상이면 보통 60점 이상.
    - 불법 도박/성인 콘텐츠/피싱이 명백하면 80점 이상.
    - navver.com, naber.com 같은 명백한 오타 도메인은 70점 이상 부여.

    [분석할 URL]   
    {url}

    [응답 형식 (JSON Only)]
    {{
      "score": (0~100 사이 정수),
      "is_typosquatting": (true/false),
      "suggested_url": "(공식 URL 문자열 또는 null, 반드시 http:// 또는 https://로 시작하도록 작성)",
      "reason": "(한국어로 된 분석 결과 요약 - 위의 기준 중 해당되는 항목들을 구체적으로 언급)"
    }}
    """

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",  # JSON 응답 강제
        },
    }

    try:
        # 비동기 요청 (타임아웃 10초)
        response = await client.post(api_url, json=payload, timeout=10.0)
        response.raise_for_status()

        # Gemini 응답에서 텍스트 추출
        data = response.json()
        gemini_response_text = data["candidates"][0]["content"]["parts"][0]["text"]

        # 텍스트(JSON 문자열)를 파이썬 dict로 변환
        result = json.loads(gemini_response_text)

        # suggested_url 후처리: 도메인만 온 경우에도 항상 https:// 붙여주기
        suggested = result.get("suggested_url")
        if isinstance(suggested, str):
            s = suggested.strip()
            if s and not s.lower().startswith(("http://", "https://")):
                # 도메인만 왔다고 보고 https:// prefix 붙임
                s = "https://" + s.lstrip("/")
            result["suggested_url"] = s or None

        return result

    except Exception as e:
        print(f"Gemini API 오류: {e}")
        # 에러 발생 시 상위 모듈(decision_engine)에서 처리하도록 예외를 던짐
        raise e
