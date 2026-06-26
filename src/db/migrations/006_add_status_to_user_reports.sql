-- H7: agrega columna status a user_reports para gestión de denuncias en el backoffice
ALTER TABLE user_reports
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'resolved', 'discarded'));

CREATE INDEX IF NOT EXISTS idx_user_reports_status_reported
  ON user_reports(status, reported_id);
