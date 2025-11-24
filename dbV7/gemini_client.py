import httpx
import os
import json
from dotenv import load_dotenv
from urllib.parse import urlparse

# .env 로드
load_dotenv()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# 오타 도메인 사전 필터링을 위한 주요 사이트 목록
FAMOUS_DOMAINS = [
    # 한국 주요 사이트
    "naver.com", "daum.net", "kakao.com", "coupang.com", "11st.co.kr", "gmarket.co.kr",
    "kbstar.com", "ibk.co.kr", "shinhan.com", "hanabank.com", "wooribank.com",
    # 글로벌 주요 사이트
    "google.com", "facebook.com", "amazon.com", "paypal.com", "apple.com", "microsoft.com",
    "netflix.com", "twitter.com", "instagram.com", "linkedin.com", "youtube.com",
    "github.com", "reddit.com", "wikipedia.org", "yahoo.com", "ebay.com"
]

BRAND_KEYWORDS = [
    # 한국 브랜드
    "naver", "kakao", "kakaotalk", "daum", "coupang", "11st", "gmarket",
    "kbstar", "shinhan", "hana", "woori", "samsung", "lg", "hyundai",
    # 글로벌 브랜드
    "google", "facebook", "amazon", "paypal", "apple", "microsoft",
    "netflix", "twitter", "instagram", "linkedin", "youtube", "github"
]

SUSPICIOUS_TLDS = [
    ".tk", ".ml", ".ga", ".cf", ".gq",  # 무료 도메인
    ".xyz", ".top", ".work", ".click", ".link",  # 저렴한 TLD
    ".beer", ".download", ".loan", ".win", ".racing"  # 비정상적 TLD
]

def levenshtein_distance(s1: str, s2: str) -> int:
    """
    두 문자열 간의 편집 거리(Levenshtein Distance)를 계산합니다.
    삽입, 삭제, 대체 연산의 최소 횟수를 반환합니다.
    """
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            # 삽입, 삭제, 대체 비용 계산
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    
    return previous_row[-1]

def check_typosquatting(url: str) -> dict:
    """
    프로그래밍 방식으로 오타 도메인을 사전 탐지합니다.
    편집 거리 알고리즘 + 브랜드 키워드 임베딩 탐지를 사용합니다.
    
    반환값: {"is_typo": bool, "original": str or None, "distance": int}
    """
    try:
        # URL에서 도메인 추출
        if not url.startswith(('http://', 'https://')):
            url = f'https://{url}'
        
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        
        # 포트 번호 제거
        if ':' in domain:
            domain = domain.split(':')[0]
        
        # www. 제거
        if domain.startswith('www.'):
            domain = domain[4:]
        
        # 빈 도메인 처리
        if not domain:
            domain = parsed.path.split('/')[0].lower()
        
        print(f"[v0 DEBUG] ========================================")
        print(f"[v0 DEBUG] 오타 체크 시작")
        print(f"[v0 DEBUG] 원본 URL: {url}")
        print(f"[v0 DEBUG] 추출된 도메인: {domain}")
        print(f"[v0 DEBUG] ========================================")
        
        # kakaotalk.download.beer 같은 패턴 탐지
        for brand in BRAND_KEYWORDS:
            if brand in domain:
                # 실제 공식 도메인인지 확인
                is_official = False
                for official in FAMOUS_DOMAINS:
                    if domain == official or domain.endswith(f".{official}"):
                        is_official = True
                        break
                
                # 공식 도메인이 아닌데 브랜드 키워드가 포함되어 있으면 의심
                if not is_official:
                    # TLD가 의심스러운지 확인
                    is_suspicious_tld = any(domain.endswith(tld) for tld in SUSPICIOUS_TLDS)
                    
                    # 서브도메인에 브랜드가 있는지 확인 (kakaotalk.download.beer)
                    parts = domain.split('.')
                    brand_in_subdomain = any(brand in part for part in parts[:-2]) if len(parts) > 2 else False
                    
                    if is_suspicious_tld or brand_in_subdomain or len(parts) > 3:
                        print(f"[v0 DEBUG] ⚠️⚠️⚠️ 브랜드 키워드 임베딩 피싱 탐지! ⚠️⚠️⚠️")
                        print(f"[v0 DEBUG] 의심 도메인: {domain}")
                        print(f"[v0 DEBUG] 탐지된 브랜드: {brand}")
                        print(f"[v0 DEBUG] 의심스러운 TLD: {is_suspicious_tld}")
                        print(f"[v0 DEBUG] 브랜드 서브도메인 사용: {brand_in_subdomain}")
                        print(f"[v0 DEBUG] ========================================")
                        
                        # 원본 공식 사이트 찾기
                        suggested = None
                        for official in FAMOUS_DOMAINS:
                            if brand in official.split('.')[0]:
                                suggested = official
                                break
                        
                        return {
                            "is_typo": True,
                            "original": suggested or f"{brand}.com",
                            "distance": 0  # 브랜드 임베딩은 거리 0으로 표시
                        }
        
        # 유명 도메인과 편집 거리 계산
        closest_match = None
        min_distance = float('inf')
        
        for famous in FAMOUS_DOMAINS:
            distance = levenshtein_distance(domain, famous)
            
            print(f"[v0 DEBUG] {domain} <-> {famous} = 편집 거리 {distance}")
            
            # 최소 거리 추적
            if distance < min_distance and distance > 0:
                min_distance = distance
                closest_match = famous
            
            if 1 <= distance <= 3 and domain != famous:
                print(f"[v0 DEBUG] ⚠️⚠️⚠️ 오타 도메인 탐지! ⚠️⚠️⚠️")
                print(f"[v0 DEBUG] 의심 도메인: {domain}")
                print(f"[v0 DEBUG] 원본 사이트: {famous}")
                print(f"[v0 DEBUG] 편집 거리: {distance}")
                print(f"[v0 DEBUG] ========================================")
                return {
                    "is_typo": True,
                    "original": famous,
                    "distance": distance
                }
        
        print(f"[v0 DEBUG] 오타 도메인 아님")
        print(f"[v0 DEBUG] 가장 가까운 사이트: {closest_match} (거리: {min_distance})")
        print(f"[v0 DEBUG] ========================================")
        return {"is_typo": False, "original": None, "distance": 0}
    
    except Exception as e:
        print(f"[v0 DEBUG] ❌ 오타 체크 오류: {e}")
        import traceback
        traceback.print_exc()
        return {"is_typo": False, "original": None, "distance": 0}

async def analyze_url_with_gemini(url: str, client: httpx.AsyncClient) -> dict:
    """
    Gemini API를 호출하여 URL의 종합적인 위험도를 분석합니다.
    
    분석 대상:
    - 오타 도메인 피싱 (Typosquatting)
    - 불법 도박 사이트
    - 불법 성인 콘텐츠 사이트
    - 금융 피싱 사이트
    - 사기/스캠 사이트
    - 악성코드/바이러스 사이트
    - URL 구조 기반 위험 패턴
    
    반환: {"score": 0~100, "is_typosquatting": bool, "suggested_url": str or null, "reason": str}
    """
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY가 .env에 설정되지 않았습니다.")
    
    print(f"[v0 DEBUG] ========================================")
    print(f"[v0 DEBUG] Gemini AI 종합 분석 시작")
    print(f"[v0 DEBUG] URL: {url}")
    print(f"[v0 DEBUG] ========================================")
    
    typo_check = check_typosquatting(url)
    print(f"[v0 DEBUG] 오타 체크 최종 결과: {typo_check}")
    
    # 오타 도메인으로 판정되면 Gemini 호출 없이 즉시 높은 점수 반환
    if typo_check["is_typo"]:
        if typo_check["distance"] == 0:
            # 브랜드 키워드 임베딩 패턴 (kakaotalk.download.beer 같은 경우)
            score = 90
            reason = f"제공된 URL은 '{typo_check['original']}' 브랜드를 악용한 피싱 사이트입니다. 공식 도메인이 아닌데 브랜드 이름을 서브도메인이나 경로에 포함시켜 사용자를 속이려는 의도가 명백합니다."
        else:
            # 편집 거리 기반 오타 도메인
            score = 85 + (4 - typo_check["distance"]) * 5  # 거리 1=100점, 2=95점, 3=90점
            reason = f"제공된 URL은 '{typo_check['original']}' 공식 사이트를 모방한 오타 도메인입니다. 편집 거리 {typo_check['distance']}로 매우 유사하며, 사용자의 오타 입력을 노린 피싱 사이트로 의심됩니다."
        
        result = {
            "score": min(100, score),  # 최대 100점
            "is_typosquatting": True,
            "suggested_url": f"https://{typo_check['original']}",
            "reason": reason
        }
        print(f"[v0 DEBUG] ========================================")
        print(f"[v0 DEBUG] 🚨🚨🚨 오타 도메인으로 즉시 차단 🚨🚨🚨")
        print(f"[v0 DEBUG] 반환 결과: {result}")
        print(f"[v0 DEBUG] ========================================")
        return result
        
    # Gemini 2.5 Flash 모델 사용
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    prompt = f"""
    당신은 세계 최고의 피싱 사이트 및 악성 사이트 탐지 보안 전문가 AI입니다. 
    다음 URL을 정밀 분석하고 결과를 요청한 JSON 형식으로만 응답해 주세요.

    [중요 요청사항]
    1. 분석 결과에 대한 설명(reason)은 **반드시 '한국어(Korean)'로 작성**해 주세요.
    2. 전문적인 보안 용어는 사용하되, 설명은 비전공자도 이해하기 쉽게 명확하게 작성하세요.
    3. JSON 형식을 엄격하게 지켜주세요.
    4. **URL과 콘텐츠를 종합적으로 분석**하여 점수를 산정하세요.

    [분석 기준]
    1. score: 피싱/악성 사이트 의심 점수 (0~100) 
       - 0~20: 매우 안전 (공식 사이트, 정부 기관 등)
       - 21~40: 낮은 위험 (일반 웹사이트)
       - 41~60: 중간 위험 (의심스러운 요소 존재)
       - 61~80: 높은 위험 (피싱/악성 사이트 가능성 높음)
       - 81~100: 매우 위험 (확실한 피싱/악성 사이트)
       
    2. is_typosquatting: 유명 사이트를 교묘하게 모방한 오타 도메인인지 (true/false)
    
    3. suggested_url: 오타 도메인(true)일 경우, 원래 접속하려 했던 공식 URL. 아니라면 null
    
    4. reason: 해당 점수를 부여한 구체적인 근거 및 분석 내용을 자세히 설명(**반드시 한국어로 최소 3문장 이상 작성**)

    [종합 악성 사이트 탐지 기준]
    다음 모든 유형의 피싱/악성 사이트를 종합적으로 분석하여 점수를 산정하세요:
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 1: 오타 도메인 피싱 (Typosquatting)
    ═══════════════════════════════════════════════════════════════
    # 주요 사이트 목록 (반드시 숙지)
    {', '.join(FAMOUS_DOMAINS)}
    
    # 오타 패턴 예시 (이런 패턴은 70~100점)
    - 문자 중복: navver.com (naver → navver)
    - 문자 교체: naber.com (naver → naber)
    - 문자 누락: gogle.com (google → gogle)
    - 유사 문자: goog1e.com (l→1)
    - 브랜드 임베딩: kakaotalk.download.beer (서브도메인에 브랜드 악용)
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 2: 불법 도박 사이트 (60~90점)
    ═══════════════════════════════════════════════════════════════
    - 도메인 키워드: bet, casino, poker, slot, gamble, 토토, 배팅, 카지노
    - 과도한 보너스/환전 홍보
    - 불법 스포츠 베팅
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 3: 불법 성인 콘텐츠 사이트 (60~90점)
    ═══════════════════════════════════════════════════════════════
    - 도메인 키워드: porn, xxx, sex, adult, 야동, 19금
    - 불법 촬영물 유포 의심
    - 연령 확인 없이 노출
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 4: 금융 피싱 사이트 (70~95점)
    ═══════════════════════════════════════════════════════════════
    - 은행/금융 사칭
    - 카드번호/비밀번호 직접 입력 요구
    - 긴급성 유도 ("계좌 정지", "본인 확인")
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 5: 사기/스캠 사이트 (50~80점)
    ═══════════════════════════════════════════════════════════════
    - 가짜 경품/이벤트
    - 피라미드/다단계
    - 가짜 쇼핑몰 (비정상 저가, 선입금 요구)
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 6: 악성코드/바이러스 사이트 (70~95점)
    ═══════════════════════════════════════════════════════════════
    - 자동 다운로드
    - 무한 팝업/리다이렉트
    - 브라우저 잠금
    
    ═══════════════════════════════════════════════════════════════
    📌 카테고리 7: URL 구조 기반 탐지
    ═══════════════════════════════════════════════════════════════
    - URL 길이 100자 이상 (+10~20점)
    - 특수문자 과다 (+15~25점)
    - 숫자 과다 혼합 (+20~30점)
    - IP 주소 직접 사용 (+30~40점)
    - 서브도메인 3단계 이상 (+20~30점)
    - 의심스러운 TLD: .tk, .ml, .ga, .xyz, .beer, .download (+25~35점)
    - HTTPS 미사용하면서 개인정보 요구 (+20~30점)
    
    ═══════════════════════════════════════════════════════════════

    [종합 판단 기준]
    - 여러 카테고리에 해당되면 점수 누적
    - 명백한 공식 사이트는 0~20점
    - 의심스러운 요소가 2개 이상이면 60점 이상
    - 불법 도박/성인 콘텐츠/피싱 명백하면 80점 이상
    - navver.com, naber.com, kakaotalk.download.beer 같은 명백한 피싱은 반드시 80점 이상

    [분석할 URL]   
    {url}

    [응답 형식 (JSON Only)]
    {{
      "score": (0~100 사이 정수),
      "is_typosquatting": (true/false),
      "suggested_url": "(공식 URL 문자열 또는 null)",
      "reason": "(한국어로 된 자세한 분석 결과 - 최소 3문장 이상, 위의 기준 중 해당되는 항목들을 구체적으로 언급)"
    }}
    """

    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
        }
    }

    try:
        # 비동기 요청 (타임아웃 15초)
        response = await client.post(api_url, json=payload, timeout=15.0)
        response.raise_for_status()
        
        # 응답 파싱
        gemini_response_text = response.json()['candidates'][0]['content']['parts'][0]['text']
        
        print(f"[v0 DEBUG] Gemini 응답: {gemini_response_text}")
        
        # 텍스트를 JSON 객체로 변환하여 반환
        result = json.loads(gemini_response_text)
        print(f"[v0 DEBUG] 최종 점수: {result.get('score')}점")
        print(f"[v0 DEBUG] ========================================")
        return result

    except Exception as e:
        print(f"[v0 DEBUG] Gemini API 오류: {e}")
        raise e
