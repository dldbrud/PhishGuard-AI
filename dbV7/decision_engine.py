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
    """
    URL 위험도 판단 프로세스:
    1. DB 전역/개인 차단 확인 (가장 빠른 응답)
    2. Google Safe Browsing 확인 (악성코드/피싱 DB)
    3. Gemini AI 종합 분석 (오타 도메인, 불법 도박, 성인 콘텐츠, 피싱, 사기 등 종합 판단)
    """
    print(f"[v0 DEBUG] ========================================")
    print(f"[v0 DEBUG] get_decision 호출: {url}")
    print(f"[v0 DEBUG] ========================================")
    
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

    gsb_status, _ = await safebrowsing_client.check_safe_browsing(url, client)

    if gsb_status == safebrowsing_client.GSB_STATUS_DANGEROUS:
        ai_reason = "Google Safe Browsing: 악성코드 또는 피싱 사이트로 등록된 위험한 웹사이트입니다."
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
        print(f"[v0 DEBUG] Gemini AI 종합 분석 시작...")
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
        # 고위험: 전역 차단 DB에 등록
        service.add_global_block(url, ai_reason=ai_reason, suggested_url=suggested_url)
        return {
            "decision": "BLOCK",
            "reason": f"{REASON_GEMINI_BLOCK} (Score: {score})",
            "ai_reason": ai_reason or "AI 분석 결과 고위험 사이트로 판정되었습니다.",
            "suggested_official_url": suggested_url,
        }

    # 중간 위험: 경고
    if score >= 50:
        return {
            "decision": "WARN",
            "reason": f"{REASON_GEMINI_WARN} (Score: {score})",
            "ai_reason": ai_reason or "AI 분석 결과 의심스러운 사이트입니다.",
            "suggested_official_url": suggested_url,
        }

    # 안전
    return {
        "decision": "SAFE",
        "reason": REASON_SAFE,
        "ai_reason": ai_reason,
        "suggested_official_url": suggested_url,
    }
