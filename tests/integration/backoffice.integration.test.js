'use strict';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────
// Reemplazamos el cliente del servicio de users y el mailer porque en CI
// esos servicios externos no están corriendo.

jest.mock('../../src/clients/usersClient', () => ({
  usersClient: {
    listUsers:   jest.fn(),
    getUser:     jest.fn(),
    suspendUser: jest.fn(),
    unsuspendUser: jest.fn(),
    getMetrics:  jest.fn(),
  },
}));

jest.mock('../../src/config/mailer', () => ({
  sendTempPasswordEmail:      jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail:   jest.fn().mockResolvedValue(undefined),
  sendMail:                   jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const request = require('supertest');

const app        = require('../../src/app');
const { pool }   = require('../../src/config/database');
const { usersClient } = require('../../src/clients/usersClient');

// ─── Constantes ───────────────────────────────────────────────────────────────

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const PASSWORD         = 'TestPass123!';
const NEW_PASSWORD     = 'NuevoPass456!';

// Usuarios de prueba con UUIDs fijos para reproducibilidad
const SUPERADMIN = {
  id:    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  email: 'superadmin@udesa.edu.ar',
  role:  'superadmin',
};

const MODERADOR = {
  id:    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  email: 'moderador@udesa.edu.ar',
  role:  'moderator',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Genera un JWT de admin válido (firma real, no mock). */
function makeAdminToken(admin, { mustChangePassword = false, tokenVersion = 1 } = {}) {
  return jwt.sign(
    {
      sub:                  admin.id,
      email:                admin.email,
      role:                 admin.role,
      token_version:        tokenVersion,
      must_change_password: mustChangePassword,
      type:                 'access',
    },
    ADMIN_JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Extrae el valor de la cookie adminRefreshToken de la respuesta. */
function extractRefreshCookie(res) {
  const cookies = res.headers['set-cookie'] ?? [];
  const c = cookies.find(s => s.startsWith('adminRefreshToken='));
  return c ? c.split('adminRefreshToken=')[1].split(';')[0] : null;
}

/** Inserta un admin directamente en la DB (bcrypt rounds=4 para velocidad). */
async function insertAdmin({
  id,
  email,
  role = 'superadmin',
  mustChangePassword = false,
  tokenVersion = 1,
  lockedUntil = null,
  tempPasswordExpiresAt = null,
}) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  await pool.query(
    `INSERT INTO admins
       (id, email, password_hash, role, must_change_password, token_version,
        locked_until, temp_password_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, email, hash, role, mustChangePassword, tokenVersion, lockedUntil, tempPasswordExpiresAt]
  );
}

/** Inserta un refresh token directamente en la DB. */
async function insertRefreshToken(adminId, token, expiresAt) {
  await pool.query(
    `INSERT INTO admin_refresh_tokens (admin_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [adminId, hashToken(token), expiresAt]
  );
}

/** Lee el admin de la DB para verificar estado. */
async function findAdminInDB(id) {
  const { rows } = await pool.query('SELECT * FROM admins WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const migrationsDir = path.join(__dirname, '../../src/db/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
  }
});

beforeEach(async () => {
  // Limpia todas las tablas antes de cada test para garantizar aislamiento.
  await pool.query('TRUNCATE admins, service_health_status CASCADE');
  jest.clearAllMocks();

  // Defaults para usersClient (se pueden sobreescribir por test)
  usersClient.listUsers.mockResolvedValue({
    users: [], total: 0, page: 1, limit: 20,
  });
  usersClient.getUser.mockResolvedValue({
    id: 'user-uuid', username: 'testuser', email: 'user@test.com',
    is_suspended: false, is_verified: true, deleted_at: null,
    created_at: new Date().toISOString(), last_login_at: null,
    failed_login_attempts: 0, locked_until: null,
  });
  usersClient.suspendUser.mockResolvedValue({ message: 'Usuario suspendido' });
  usersClient.unsuspendUser.mockResolvedValue({ message: 'Suspensión levantada' });
  usersClient.getMetrics.mockResolvedValue({
    total_users: '100', new_this_month: '10', new_this_week: '3',
    suspended_users: '2', deleted_users: '1', online_now: '5',
    weekly_registrations: [],
  });
});

afterAll(async () => {
  await pool.end();
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/auth/login', () => {
  it('200: devuelve accessToken y sets cookie con credenciales válidas', async () => {
    await insertAdmin(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: SUPERADMIN.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.admin.role).toBe('superadmin');
    expect(extractRefreshCookie(res)).not.toBeNull();
  });

  it('401: credenciales inválidas si el email no existe', async () => {
    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'noexiste@udesa.edu.ar', password: PASSWORD });

    expect(res.status).toBe(401);
  });

  it('401: contraseña incorrecta', async () => {
    await insertAdmin(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: SUPERADMIN.email, password: 'mal_password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciales inválidas');
  });

  it('423: cuenta bloqueada por intentos fallidos', async () => {
    await insertAdmin({ ...SUPERADMIN, lockedUntil: new Date(Date.now() + 30 * 60 * 1000) });

    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: SUPERADMIN.email, password: PASSWORD });

    expect(res.status).toBe(423);
  });

  it('403: contraseña temporal expirada', async () => {
    await insertAdmin({
      ...SUPERADMIN,
      mustChangePassword:   true,
      tempPasswordExpiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: SUPERADMIN.email, password: PASSWORD });

    expect(res.status).toBe(403);
  });

  it('200: login con must_change_password=true (contraseña vigente) devuelve el flag en admin', async () => {
    await insertAdmin({
      ...SUPERADMIN,
      mustChangePassword:   true,
      tempPasswordExpiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });

    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: SUPERADMIN.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.admin.must_change_password).toBe(true);
  });

  it('400: falla validación si falta email', async () => {
    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ password: PASSWORD });

    expect(res.status).toBe(400);
  });

  it('incrementa failed_login_attempts en la DB tras contraseña incorrecta', async () => {
    await insertAdmin(SUPERADMIN);

    await request(app)
      .post('/api/admin/auth/login')
      .send({ email: SUPERADMIN.email, password: 'mal_pass' });

    const admin = await findAdminInDB(SUPERADMIN.id);
    expect(admin.failed_login_attempts).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/admin/auth/refresh', () => {
  it('200: devuelve nuevo accessToken con cookie RT válida', async () => {
    await insertAdmin(SUPERADMIN);
    const rt = 'valid-refresh-token-uuid';
    await insertRefreshToken(SUPERADMIN.id, rt, new Date(Date.now() + 7 * 86400 * 1000));

    const res = await request(app)
      .post('/api/admin/auth/refresh')
      .set('Cookie', `adminRefreshToken=${rt}`);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('401: sin cookie de refresh token', async () => {
    const res = await request(app).post('/api/admin/auth/refresh');

    expect(res.status).toBe(401);
  });

  it('401: refresh token inválido (no existe en la DB)', async () => {
    await insertAdmin(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/auth/refresh')
      .set('Cookie', 'adminRefreshToken=token-que-no-existe');

    expect(res.status).toBe(401);
  });

  it('401: refresh token expirado', async () => {
    await insertAdmin(SUPERADMIN);
    const rt = 'expired-refresh-token';
    await insertRefreshToken(SUPERADMIN.id, rt, new Date(Date.now() - 1000)); // ya expiró

    const res = await request(app)
      .post('/api/admin/auth/refresh')
      .set('Cookie', `adminRefreshToken=${rt}`);

    expect(res.status).toBe(401);
  });

  it('rota el refresh token (el viejo ya no sirve)', async () => {
    await insertAdmin(SUPERADMIN);
    const rt = 'rt-to-rotate';
    await insertRefreshToken(SUPERADMIN.id, rt, new Date(Date.now() + 7 * 86400 * 1000));

    await request(app)
      .post('/api/admin/auth/refresh')
      .set('Cookie', `adminRefreshToken=${rt}`);

    // Segunda llamada con el mismo token debe fallar (ya fue rotado)
    const res2 = await request(app)
      .post('/api/admin/auth/refresh')
      .set('Cookie', `adminRefreshToken=${rt}`);

    expect(res2.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/admin/auth/logout', () => {
  it('200: cierra la sesión correctamente', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/auth/logout')
      .set(bearer(token));

    expect(res.status).toBe(200);
  });

  it('401: sin access token', async () => {
    const res = await request(app).post('/api/admin/auth/logout');

    expect(res.status).toBe(401);
  });

  it('invalida el access token (incrementa token_version en DB)', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    await request(app)
      .post('/api/admin/auth/logout')
      .set(bearer(token));

    const admin = await findAdminInDB(SUPERADMIN.id);
    expect(admin.token_version).toBe(2); // was 1, incremented by logout
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/admin/auth/change-password', () => {
  it('200: cambia la contraseña de un admin con must_change_password=true', async () => {
    await insertAdmin({ ...SUPERADMIN, mustChangePassword: true });
    const token = makeAdminToken(SUPERADMIN, { mustChangePassword: true });

    const res = await request(app)
      .post('/api/admin/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);

    // Verificar que must_change_password se actualizó en la DB
    const admin = await findAdminInDB(SUPERADMIN.id);
    expect(admin.must_change_password).toBe(false);
  });

  it('401: contraseña actual incorrecta', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: 'mal_pass', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('400: nueva contraseña igual a la actual', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD });

    expect(res.status).toBe(400);
  });

  it('400: confirmPassword no coincide con newPassword (validación Zod)', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: 'OtraCosa1!' });

    expect(res.status).toBe(400);
  });

  it('401: sin access token', async () => {
    const res = await request(app)
      .post('/api/admin/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('revoca todos los refresh tokens tras el cambio', async () => {
    await insertAdmin(SUPERADMIN);
    const rt = 'rt-pre-cambio';
    await insertRefreshToken(SUPERADMIN.id, rt, new Date(Date.now() + 7 * 86400 * 1000));
    const token = makeAdminToken(SUPERADMIN);

    await request(app)
      .post('/api/admin/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    // El RT anterior ya no debería servir
    const res = await request(app)
      .post('/api/admin/auth/refresh')
      .set('Cookie', `adminRefreshToken=${rt}`);

    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMINS
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/admins', () => {
  it('200: superadmin obtiene la lista de admins', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .get('/api/admin/admins')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.admins)).toBe(true);
    expect(res.body.admins[0].email).toBe(SUPERADMIN.email);
  });

  it('401: sin access token', async () => {
    const res = await request(app).get('/api/admin/admins');

    expect(res.status).toBe(401);
  });

  it('200: moderador puede listar admins', async () => {
    await insertAdmin(MODERADOR);
    const token = makeAdminToken(MODERADOR);

    const res = await request(app)
      .get('/api/admin/admins')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.admins).toBeDefined();
  });

  it('403: admin con must_change_password=true no puede acceder', async () => {
    await insertAdmin({ ...SUPERADMIN, mustChangePassword: true });
    const token = makeAdminToken(SUPERADMIN, { mustChangePassword: true });

    const res = await request(app)
      .get('/api/admin/admins')
      .set(bearer(token));

    expect(res.status).toBe(403);
  });

  it('401: token con token_version desactualizado (sesión revocada)', async () => {
    await insertAdmin(SUPERADMIN);
    // El token dice version=1 pero la DB ya tiene version=2 (logout previo)
    const staleToken = makeAdminToken(SUPERADMIN, { tokenVersion: 1 });
    // Incrementar version en la DB simulando un logout previo
    await pool.query('UPDATE admins SET token_version = 2 WHERE id = $1', [SUPERADMIN.id]);

    const res = await request(app)
      .get('/api/admin/admins')
      .set(bearer(staleToken));

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/admin/admins', () => {
  it('201: superadmin crea un nuevo admin moderador', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/admins')
      .set(bearer(token))
      .send({ email: 'nuevo@udesa.edu.ar', role: 'moderator' });

    expect(res.status).toBe(201);
    expect(res.body.admin.email).toBe('nuevo@udesa.edu.ar');
    expect(res.body.admin.temp_password).toBeDefined();
  });

  it('409: email duplicado', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);
    // Insertar admin con ese email primero
    await insertAdmin({ ...MODERADOR, email: 'existente@udesa.edu.ar' });

    const res = await request(app)
      .post('/api/admin/admins')
      .set(bearer(token))
      .send({ email: 'existente@udesa.edu.ar', role: 'moderator' });

    expect(res.status).toBe(409);
  });

  it('400: email inválido (validación Zod)', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/admins')
      .set(bearer(token))
      .send({ email: 'no-es-email', role: 'moderator' });

    expect(res.status).toBe(400);
  });

  it('403: moderador no puede crear admins', async () => {
    await insertAdmin(MODERADOR);
    const token = makeAdminToken(MODERADOR);

    const res = await request(app)
      .post('/api/admin/admins')
      .set(bearer(token))
      .send({ email: 'nuevo@udesa.edu.ar', role: 'moderator' });

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/admin/admins/:id/reset-password', () => {
  it('200: superadmin regenera contraseña temporal de otro admin', async () => {
    await insertAdmin(SUPERADMIN);
    await insertAdmin({ ...MODERADOR, mustChangePassword: true });
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post(`/api/admin/admins/${MODERADOR.id}/reset-password`)
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.temp_password).toBeDefined();
  });

  it('400: no puede resetear su propia contraseña', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post(`/api/admin/admins/${SUPERADMIN.id}/reset-password`)
      .set(bearer(token));

    expect(res.status).toBe(400);
  });

  it('404: admin objetivo no existe', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/admins/no-existe-uuid/reset-password')
      .set(bearer(token));

    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// USUARIOS (llamadas a users service — mockeadas)
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/users', () => {
  it('200: devuelve la lista de usuarios del servicio de users', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);
    usersClient.listUsers.mockResolvedValue({
      users: [{ id: 'u1', username: 'alice', email: 'alice@test.com' }],
      total: 1, page: 1, limit: 20,
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(usersClient.listUsers).toHaveBeenCalled();
  });

  it('pasa los query params de búsqueda al cliente', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    await request(app)
      .get('/api/admin/users?search=alice&page=2&limit=10')
      .set(bearer(token));

    expect(usersClient.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'alice', page: '2', limit: '10' })
    );
  });

  it('401: sin access token', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('403: admin con contraseña temporal no puede acceder', async () => {
    await insertAdmin({ ...SUPERADMIN, mustChangePassword: true });
    const token = makeAdminToken(SUPERADMIN, { mustChangePassword: true });

    const res = await request(app)
      .get('/api/admin/users')
      .set(bearer(token));

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/admin/users/:id', () => {
  it('200: devuelve el detalle del usuario', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .get('/api/admin/users/user-uuid')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-uuid');
  });

  it('propagga el error del users service (ej: 404)', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);
    const { AppError } = require('../../src/middlewares/errorHandler');
    usersClient.getUser.mockRejectedValue(new AppError(404, 'Usuario no encontrado'));

    const res = await request(app)
      .get('/api/admin/users/no-existe')
      .set(bearer(token));

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/admin/users/:id/suspend', () => {
  it('200: suspende al usuario y registra la acción de moderación', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/users/user-uuid/suspend')
      .set(bearer(token))
      .send({ reason: 'Comportamiento inapropiado' });

    expect(res.status).toBe(200);
    expect(usersClient.suspendUser).toHaveBeenCalledWith('user-uuid');

    // Verificar que la acción quedó registrada en moderation_actions
    const { rows } = await pool.query(
      'SELECT * FROM moderation_actions WHERE target_user_id = $1',
      ['user-uuid']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('suspend');
    expect(rows[0].reason).toBe('Comportamiento inapropiado');
  });

  it('400: falta el motivo (reason es obligatorio)', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/users/user-uuid/suspend')
      .set(bearer(token))
      .send({});

    expect(res.status).toBe(400);
    expect(usersClient.suspendUser).not.toHaveBeenCalled();
  });

  it('400: reason vacío no es válido', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/users/user-uuid/suspend')
      .set(bearer(token))
      .send({ reason: '   ' });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/admin/users/:id/unsuspend', () => {
  it('200: levanta la suspensión del usuario', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/admin/users/user-uuid/unsuspend')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(usersClient.unsuspendUser).toHaveBeenCalledWith('user-uuid');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MÉTRICAS
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/metrics', () => {
  it('200: devuelve las métricas del servicio de users', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .get('/api/admin/metrics')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.total_users).toBeDefined();
    expect(res.body.weekly_registrations).toBeDefined();
  });

  it('401: sin access token', async () => {
    const res = await request(app).get('/api/admin/metrics');
    expect(res.status).toBe(401);
  });

  it('403: admin con contraseña temporal no puede ver métricas', async () => {
    await insertAdmin({ ...SUPERADMIN, mustChangePassword: true });
    const token = makeAdminToken(SUPERADMIN, { mustChangePassword: true });

    const res = await request(app)
      .get('/api/admin/metrics')
      .set(bearer(token));

    expect(res.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/services/health', () => {
  it('200: devuelve el estado de todos los servicios', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    const res = await request(app)
      .get('/api/admin/services/health')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.services)).toBe(true);

    // En CI los servicios no están corriendo → todos reportan isUp: false, pero la respuesta es 200
    const names = res.body.services.map(s => s.name);
    expect(names).toContain('users');
  });

  it('persiste el estado de los servicios en service_health_status', async () => {
    await insertAdmin(SUPERADMIN);
    const token = makeAdminToken(SUPERADMIN);

    await request(app)
      .get('/api/admin/services/health')
      .set(bearer(token));

    const { rows } = await pool.query('SELECT * FROM service_health_status');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('401: sin access token', async () => {
    const res = await request(app).get('/api/admin/services/health');
    expect(res.status).toBe(401);
  });

  it('403: admin con contraseña temporal no puede ver estado de servicios', async () => {
    await insertAdmin({ ...SUPERADMIN, mustChangePassword: true });
    const token = makeAdminToken(SUPERADMIN, { mustChangePassword: true });

    const res = await request(app)
      .get('/api/admin/services/health')
      .set(bearer(token));

    expect(res.status).toBe(403);
  });
});
