-- H11: tabla para recordar el último estado conocido de cada microservicio
-- Permite detectar transiciones UP→DOWN y disparar alertas por email (CA.4)
CREATE TABLE IF NOT EXISTS service_health_status (
  service_name VARCHAR(50) PRIMARY KEY,
  is_up        BOOLEAN     NOT NULL DEFAULT TRUE,
  last_checked TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_down_at TIMESTAMPTZ
);

-- H5 CA.1: tabla de auditoría de acciones de moderación sobre usuarios
CREATE TABLE IF NOT EXISTS moderation_actions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id       UUID        NOT NULL REFERENCES admins(id),
  target_user_id UUID        NOT NULL,
  action         VARCHAR(20) NOT NULL, -- 'suspend' | 'unsuspend'
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
