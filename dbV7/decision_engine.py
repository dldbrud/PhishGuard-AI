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
    # 1) DB 우선 확인 (전역 / 개인)
    if client_id:
        is_blocked = service.check_url(client_id, url)
        if is_blocked == 2:
            # 전역 차단 (phishing_sites, 도메인/URL)
            return {
                "decision": "BLOCK",
                "reason": REASON_DB_GLOBAL,
                "suggested_official_url": None,
            }
        if is_blocked == 1:
            # 개인 차단
            return {
                "decision": "BLOCK",
                "reason": REASON_DB_USER,
                "suggested_official_url": None,
            }

    # 2) 30일 캐시 먼저 확인
    cache = service.get_ai_cache(url, max_age_days=30)
    if cache is not None:
        gsb_status = cache.get("gsb_status")
        score = cache.get("ai_score") or 0
        ai_reason = cache.get("ai_reason")
        suggested_url = cache.get("suggested_official_url")

        # GSB가 예전에 위험 판정한 URL이면 그대로 BLOCK
        if gsb_status == safebrowsing_client.GSB_STATUS_DANGEROUS:
            return {
                "decision": "BLOCK",
                "reason": REASON_GSB_MATCH,
                "suggested_official_url": suggested_url,
            }

        # Gemini 점수 기준으로 재판정
        if score >= 80:
            # 전역 차단도 보장
            service.add_global_block(url, ai_reason=ai_reason, suggested_url=suggested_url)
            return {
                "decision": "BLOCK",
                "reason": f"{REASON_GEMINI_BLOCK} (Score: {score})",
                "suggested_official_url": suggested_url,
            }

        if score >= 50:
            return {
                "decision": "WARN",
                "reason": f"{REASON_GEMINI_WARN} (Score: {score})",
                "suggested_official_url": suggested_url,
            }

        return {
            "decision": "SAFE",
            "reason": REASON_SAFE,
            "suggested_official_url": suggested_url,
        }

    # 3) 캐시에 없으면 → GSB 실제 호출
    gsb_status, _ = await safebrowsing_client.check_safe_browsing(url, client)

    if gsb_status == safebrowsing_client.GSB_STATUS_DANGEROUS:
        # 전역 DB에도 기록
        service.add_global_block(
            url,
            ai_reason="Google Safe Browsing: Malware/Social Engineering",
            suggested_url=None,
        )
        # 캐시에도 저장
        service.upsert_ai_cache(
            url,
            gsb_status=gsb_status,
            ai_score=None,
            ai_reason="GSB: Malware/Social Engineering",
            suggested_url=None,
        )
        return {
            "decision": "BLOCK",
            "reason": REASON_GSB_MATCH,
            "suggested_official_url": None,
        }

    # 4) GSB 안전일 때만 Gemini 호출
    try:
        gemini_result = await gemini_client.analyze_url_with_gemini(url, client)
    except httpx.HTTPStatusError as e:
        # 429 등 쿼터 초과
        if e.response is not None and e.response.status_code == 429:
            # GSB가 이미 SAFE였으므로, 일단 WARN 정도로만 리턴
            service.upsert_ai_cache(
                url,
                gsb_status=gsb_status,
                ai_score=None,
                ai_reason=REASON_GEMINI_RATE_LIMIT,
                suggested_url=None,
            )
            return {
                "decision": "WARN",
                "reason": REASON_GEMINI_RATE_LIMIT,
                "suggested_official_url": None,
            }
        # 기타 에러
        service.upsert_ai_cache(
            url,
            gsb_status=gsb_status,
            ai_score=None,
            ai_reason="GEMINI_ERROR",
            suggested_url=None,
        )
        return {
            "decision": "SAFE",
            "reason": "GEMINI_ERROR",
            "suggested_official_url": None,
        }
    except Exception:
        service.upsert_ai_cache(
            url,
            gsb_status=gsb_status,
            ai_score=None,
            ai_reason="GEMINI_UNKNOWN_ERROR",
            suggested_url=None,
        )
        return {
            "decision": "SAFE",
            "reason": "GEMINI_UNKNOWN_ERROR",
            "suggested_official_url": None,
        }

    score = int(gemini_result.get("score", 0))
    ai_reason = gemini_result.get("reason")
    suggested_url = gemini_result.get("suggested_url")

    # 새 결과 캐시에 저장
    service.upsert_ai_cache(
        url,
        gsb_status=gsb_status,
        ai_score=score,
        ai_reason=ai_reason,
        suggested_url=suggested_url,
    )

    # HIGH RISK → 전역 차단 + BLOCK
    if score >= 80:
        service.add_global_block(url, ai_reason=ai_reason, suggested_url=suggested_url)
        return {
            "decision": "BLOCK",
            "reason": f"{REASON_GEMINI_BLOCK} (Score: {score})",
            "suggested_official_url": suggested_url,
        }

    # WARN
    if score >= 50:
        return {
            "decision": "WARN",
            "reason": f"{REASON_GEMINI_WARN} (Score: {score})",
            "suggested_official_url": suggested_url,
        }

    # SAFE
    return {
        "decision": "SAFE",
        "reason": REASON_SAFE,
        "suggested_official_url": suggested_url,
    }
