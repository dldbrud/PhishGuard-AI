import httpx
import service
import safebrowsing_client
import gemini_client

REASON_DB_USER = "USER_REPORTED_BLOCK"
REASON_DB_GLOBAL = "GLOBAL_DB_BLOCK"
REASON_GSB_MATCH = "GSB_MALWARE_MATCH"
REASON_GEMINI_BLOCK = "GEMINI_HIGH_RISK"
REASON_GEMINI_WARN = "GEMINI_SUSPICIOUS"
REASON_GEMINI_RATE_LIMIT = "GEMINI_RATE_LIMITED"
REASON_SAFE = "SAFE"


async def get_decision(client_id: str, client: httpx.AsyncClient, url: str) -> dict:
    print(f"[v0 DEBUG] ========================================")
    print(f"[v0 DEBUG] get_decision 호출: {url}")
    print(f"[v0 DEBUG] 오타 도메인 사전 체크 시작")
    
    typo_check = gemini_client.check_typosquatting(url)
    print(f"[v0 DEBUG] 오타 체크 결과: {typo_check}")
    
    if typo_check["is_typo"]:
        score = 85 + (4 - typo_check["distance"]) * 5
        score = min(100, score)
        ai_reason = f"제공된 URL은 '{typo_check['original']}' 공식 사이트를 모방한 오타 도메인입니다."
        suggested_url = f"https://{typo_check['original']}"
        
        print(f"[v0 DEBUG] 🚨🚨🚨 오타 도메인으로 즉시 차단! 🚨🚨🚨")
        print(f"[v0 DEBUG] 점수: {score}, 원본: {typo_check['original']}")
        print(f"[v0 DEBUG] ========================================")
        
        # 전역 차단 등록
        service.add_global_block(url, ai_reason=ai_reason, suggested_url=suggested_url)
        
        return {
            "decision": "BLOCK",
            "reason": f"{REASON_GEMINI_BLOCK} (Typosquatting: {score}점)",
            "ai_reason": ai_reason,  # 긴 분석 결과
            "suggested_official_url": suggested_url,
        }
    
    print(f"[v0 DEBUG] 오타 아님 - 일반 프로세스 진행")
    print(f"[v0 DEBUG] ========================================")
    
    # DB 우선 확인 (전역 / 개인)
    if client_id:
        is_blocked = service.check_url(client_id, url)
        if is_blocked == 2:
            # 전역 차단 (phishing_sites, 도메인/URL)
            global_info = service.get_global_info(url)
            ai_reason = global_info.get("ai_reason") if global_info else "전역 차단 목록에 등록된 위험 사이트입니다."
            suggested_url = global_info.get("official_url") if global_info else None
            return {
                "decision": "BLOCK",
                "reason": REASON_DB_GLOBAL,
                "ai_reason": ai_reason,
                "suggested_official_url": suggested_url,
            }
        if is_blocked == 1:
            # 개인 차단
            return {
                "decision": "BLOCK",
                "reason": REASON_DB_USER,
                "ai_reason": "사용자가 직접 차단한 사이트입니다.",
                "suggested_official_url": None,
            }

    # 30일 캐시 먼저 확인
    gsb_status, _ = await safebrowsing_client.check_safe_browsing(url, client)

    if gsb_status == safebrowsing_client.GSB_STATUS_DANGEROUS:
        ai_reason = "Google Safe Browsing: Malware/Social Engineering"
        # 전역 DB에도 기록
        service.add_global_block(
            url,
            ai_reason=ai_reason,
            suggested_url=None,
        )
        return {
            "decision": "BLOCK",
            "reason": REASON_GSB_MATCH,
            "ai_reason": ai_reason,
            "suggested_official_url": None,
        }

    try:
        gemini_result = await gemini_client.analyze_url_with_gemini(url, client)
    except httpx.HTTPStatusError as e:
        # 429 등 쿼터 초과
        if e.response is not None and e.response.status_code == 429:
            return {
                "decision": "WARN",
                "reason": REASON_GEMINI_RATE_LIMIT,
                "ai_reason": "AI 분석 요청 한도 초과로 일시적으로 분석할 수 없습니다.",
                "suggested_official_url": None,
            }
        return {
            "decision": "SAFE",
            "reason": "GEMINI_ERROR",
            "ai_reason": "AI 분석 중 오류가 발생했습니다.",
            "suggested_official_url": None,
        }
    except Exception:
        return {
            "decision": "SAFE",
            "reason": "GEMINI_UNKNOWN_ERROR",
            "ai_reason": "AI 분석 중 알 수 없는 오류가 발생했습니다.",
            "suggested_official_url": None,
        }

    score = int(gemini_result.get("score", 0))
    ai_reason = gemini_result.get("reason")
    suggested_url = gemini_result.get("suggested_url")

    if score >= 80:
        service.add_global_block(url, ai_reason=ai_reason, suggested_url=suggested_url)
        return {
            "decision": "BLOCK",
            "reason": f"{REASON_GEMINI_BLOCK} (Score: {score})",
            "ai_reason": ai_reason or "AI 분석 결과 고위험 사이트로 판정되었습니다.",
            "suggested_official_url": suggested_url,
        }

    # WARN
    if score >= 50:
        return {
            "decision": "WARN",
            "reason": f"{REASON_GEMINI_WARN} (Score: {score})",
            "ai_reason": ai_reason or "AI 분석 결과 의심스러운 사이트입니다.",
            "suggested_official_url": suggested_url,
        }

    # SAFE
    return {
        "decision": "SAFE",
        "reason": REASON_SAFE,
        "ai_reason": ai_reason,
        "suggested_official_url": suggested_url,
    }
