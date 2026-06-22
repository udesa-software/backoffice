-- H9 (friends): copia de las denuncias creadas en friends, enviada fire-and-forget.
-- Pensada para que H7 (Gestión de Denuncias, historia optativa no implementada aún) la consuma.
CREATE TABLE IF NOT EXISTS user_reports (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id        UUID         NOT NULL,
  reporter_username  VARCHAR(255) NOT NULL,
  reported_id        UUID         NOT NULL,
  reported_username  VARCHAR(255) NOT NULL,
  reason             VARCHAR(30)  NOT NULL,
  reported_at        TIMESTAMPTZ  NOT NULL,
  received_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reported_id);
