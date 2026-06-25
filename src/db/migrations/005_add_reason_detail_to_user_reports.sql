-- H9: copia del texto libre cuando reason = 'other' (ver friends/008_add_reason_detail_to_reports.sql)
ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS reason_detail VARCHAR(500);
