const path = require('path');
const dotenv = require('dotenv');

// Desarrollo local: priorizamos el .env global del repo.
// En deploy, las variables inyectadas por el entorno prevalecen y este archivo no interfiere.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Mapear nombres globales del repo a las variables genéricas que usa backoffice.
process.env.DB_HOST = process.env.DB_HOST || process.env.BACKOFFICE_DB_HOST;
process.env.DB_PORT = process.env.DB_PORT || process.env.BACKOFFICE_DB_PORT;
process.env.DB_NAME = process.env.DB_NAME || process.env.BACKOFFICE_DB_NAME;
process.env.DB_USER = process.env.DB_USER || process.env.BACKOFFICE_DB_USER;
process.env.DB_PASSWORD = process.env.DB_PASSWORD || process.env.BACKOFFICE_DB_PASSWORD;

process.env.USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || process.env.USERS_INTERNAL_URL || 'http://users:3000';
process.env.FRIENDS_SERVICE_URL = process.env.FRIENDS_SERVICE_URL || process.env.FRIENDS_INTERNAL_URL || 'http://friends:3000';
process.env.LOCATION_SERVICE_URL = process.env.LOCATION_SERVICE_URL || 'http://location:3000';
process.env.API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://api-gateway:4000';
process.env.BACKOFFICE_SERVICE_URL = process.env.BACKOFFICE_SERVICE_URL || 'http://backoffice:3000';
process.env.NOTIFICATIONS_SERVICE_URL = process.env.NOTIFICATIONS_SERVICE_URL || 'http://notifications:8080';
process.env.AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8001';

const fs = require('fs');
const bcrypt = require('bcryptjs');
const { env } = require('./config/env');
const { pool, query } = require('./config/database');
const app = require('./app');

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    console.log(`Migration applied: ${file}`);
  }
}

// Crea el SuperAdmin inicial si no existe ningún admin en la DB
async function seedInitialSuperAdmin() {
  if (!env.INITIAL_SUPERADMIN_EMAIL || !env.INITIAL_SUPERADMIN_TEMP_PASSWORD) return;

  const result = await query('SELECT COUNT(*) FROM admins');
  const count = parseInt(result.rows[0].count, 10);
  if (count > 0) return;

  const passwordHash = await bcrypt.hash(env.INITIAL_SUPERADMIN_TEMP_PASSWORD, 12);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await query(
    `INSERT INTO admins (email, password_hash, role, must_change_password, temp_password_expires_at)
     VALUES (LOWER($1), $2, 'superadmin', TRUE, $3)`,
    [env.INITIAL_SUPERADMIN_EMAIL, passwordHash, expiresAt]
  );

  console.log(`Initial SuperAdmin created: ${env.INITIAL_SUPERADMIN_EMAIL}`);
  console.log(`Temp password: ${env.INITIAL_SUPERADMIN_TEMP_PASSWORD} (change it immediately!)`);
}

async function start() {
  await runMigrations();
  await seedInitialSuperAdmin();

  const port = parseInt(env.PORT, 10);
  app.listen(port, () => {
    console.log(`Backoffice service running on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
