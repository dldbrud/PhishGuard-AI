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
        gsb_status = cache.get("gsb_status")  # 0/1 또는 문자열 혹은 None
        score = cache.get("ai_score") or 0
        ai_reason = cache.get("ai_reason")
        suggested_url = cache.get("suggested_official_url")

        # 정수/문자열 모두 처리해서 GSB 위험 여부 판단
        is_gsb_danger = False
        if isinstance(gsb_status, str):
            is_gsb_danger = (
                gsb_status.upper() == safebrowsing_client.GSB_STATUS_DANGEROUS
            )
        elif gsb_status is not None:
            # 1을 위험으로 간주
            is_gsb_danger = int(gsb_status) == 1

        # 예전에 GSB가 위험이라고 본 URL이면 그대로 BLOCK
        if is_gsb_danger:
            return {
                "decision": "BLOCK",
                "reason": REASON_GSB_MATCH,
                "suggested_official_url": suggested_url,
            }

        # ✅ 여기서부터는 "캐시에 저장된 Gemini 점수"만으로 판단 → 점수 고정
        if score >= 80:
            # 전역 차단도 보장 (phishing_sites 업데이트)
            service.add_global_block(
                url, ai_reason=ai_reason, suggested_url=suggested_url
            )
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
        # 전역 DB에도 기록 (차단용은 phishing_sites만)
        service.add_global_block(
            url,
            ai_reason="Google Safe Browsing: Malware/Social Engineering",
            suggested_url=None,
        )
        # ai_cache에는 따로 저장하지 않음 (GSB 전역 차단이면 이걸로 충분)
        return {
            "decision": "BLOCK",
            "reason": REASON_GSB_MATCH,
            "suggested_official_url": None,
        }

    # 4) GSB 안전일 때만 Gemini 호출
    try:
        gemini_result = await gemini_client.analyze_url_with_gemini(url, client)
    except httpx.HTTPStatusError as e:
        # 429 등 쿼터 초과 → WARN (캐시에 저장하지 않음)
        if e.response is not None and e.response.status_code == 429:
            return {
                "decision": "WARN",
                "reason": REASON_GEMINI_RATE_LIMIT,
                "suggested_official_url": None,
            }
        # 기타 HTTP 에러 → 임시 SAFE, ❌ 캐시에 저장하지 않음
        return {
            "decision": "SAFE",
            "reason": "GEMINI_ERROR",
            "suggested_official_url": None,
        }
    except Exception:
        # 알 수 없는 에러 → 임시 SAFE, ❌ 캐시에 저장하지 않음
        return {
            "decision": "SAFE",
            "reason": "GEMINI_UNKNOWN_ERROR",
            "suggested_official_url": None,
        }

    # ✅ 여기까지 왔으면 Gemini는 "정상 호출 성공"한 상태
    score = int(gemini_result.get("score", 0))
    ai_reason = gemini_result.get("reason")
    suggested_url = gemini_result.get("suggested_url")
    is_typosquatting = bool(gemini_result.get("is_typosquatting"))

    # ✅ 정상 결과는 SAFE/WARN/BLOCK 상관없이 캐시에 저장 → 이후 점수 고정
    service.upsert_ai_cache(
        url,
        gsb_status=gsb_status,
        ai_score=score,
        ai_reason=ai_reason,
        suggested_url=suggested_url,
    )

    # Typosquatting + 70점 이상 → 전역 차단 + BLOCK
    if is_typosquatting and score >= 70:
        service.add_global_block(url, ai_reason=ai_reason, suggested_url=suggested_url)
        return {
            "decision": "BLOCK",
            "reason": f"{REASON_GEMINI_BLOCK} (Typosquatting, Score: {score})",
            "suggested_official_url": suggested_url,
        }

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
