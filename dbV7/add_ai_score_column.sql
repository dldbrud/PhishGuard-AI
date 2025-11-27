-- phishing_sites 테이블에 ai_score 컬럼 추가
-- 이미 존재하는 경우 에러 무시

ALTER TABLE phishing_sites 
ADD COLUMN ai_score INT DEFAULT NULL COMMENT 'AI가 분석한 위험도 점수 (0-100)';

-- 기존 데이터에 대해 is_blocked=1인 경우 기본값 100 설정 (선택사항)
UPDATE phishing_sites 
SET ai_score = 100 
WHERE is_blocked = 1 AND ai_score IS NULL;
