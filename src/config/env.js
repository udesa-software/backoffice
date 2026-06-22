const { z } = require('zod');

const envSchema = z.object({
  PORT: z.string().default('3001'),

  DB_HOST: z.string(),
  DB_PORT: z.string().default('5432'),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),

  ADMIN_JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('8h'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  APP_URL: z.string().url(),

  // URL del microservicio de users (para llamadas internas)
  USERS_SERVICE_URL: z.string().url(),

  // H9: secreto compartido para validar llamadas internas entrantes (ej. friends -> backoffice)
  // y para autenticar las llamadas salientes de backoffice hacia users.
  INTERNAL_SECRET: z.string().optional(),

  // URLs de otros servicios para healthcheck (H11)
  FRIENDS_SERVICE_URL: z.string().url().optional(),
  LOCATION_SERVICE_URL: z.string().url().optional(),
  API_GATEWAY_URL: z.string().url().optional(),

  // Dominio permitido para emails de admins (ej: "udesa.edu.ar")
  // Si está vacío, no se restringe el dominio
  ALLOWED_EMAIL_DOMAIN: z.string().optional(),

  // SuperAdmin inicial (se usa solo si no existe ningún admin en la DB)
  INITIAL_SUPERADMIN_EMAIL: z.string().email().optional(),
  INITIAL_SUPERADMIN_TEMP_PASSWORD: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

module.exports = { env };
