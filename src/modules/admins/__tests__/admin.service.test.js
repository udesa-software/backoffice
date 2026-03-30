const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { adminService } = require('../admin.service');
const { adminRepository } = require('../admin.repository');
const { sendTempPasswordEmail } = require('../../../config/mailer');
const { AppError } = require('../../../middlewares/errorHandler');

jest.mock('../admin.repository', () => ({
  adminRepository: {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateTempPassword: jest.fn(),
  },
}));

jest.mock('../../../config/mailer', () => ({
  sendTempPasswordEmail: jest.fn(),
}));

// env es un objeto mutable: podemos cambiar ALLOWED_EMAIL_DOMAIN entre tests
jest.mock('../../../config/env', () => ({
  env: { ALLOWED_EMAIL_DOMAIN: '' },
}));

jest.mock('bcryptjs');
jest.mock('uuid');

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const { env } = require('../../../config/env');

const ADMIN_DB = {
  id: 'admin-uuid-1',
  email: 'admin@udesa.edu.ar',
  role: 'moderator',
  must_change_password: true,
  created_at: new Date(),
};

// ─── createAdmin ──────────────────────────────────────────────────────────────

describe('adminService.createAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.ALLOWED_EMAIL_DOMAIN = ''; // sin restricción de dominio por defecto
    adminRepository.findByEmail.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed_temp_password');
    uuidv4.mockReturnValue('aaaabbbb-cccc-dddd-eeee-ffffgggghhhh');
    sendTempPasswordEmail.mockResolvedValue();
    adminRepository.create.mockResolvedValue(ADMIN_DB);
  });

  it('crea el admin y devuelve sus datos junto con la contraseña temporal', async () => {
    const result = await adminService.createAdmin(
      { email: 'nuevo@udesa.edu.ar', role: 'moderator' },
      'superadmin-uuid'
    );

    expect(result).toMatchObject({ id: 'admin-uuid-1', role: 'moderator' });
    expect(result.temp_password).toBeDefined();
  });

  it('hashea la contraseña temporal con bcrypt 12 rondas', async () => {
    await adminService.createAdmin({ email: 'nuevo@udesa.edu.ar', role: 'moderator' }, 'superadmin-uuid');

    expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), 12);
  });

  it('guarda la fecha de expiración de la contraseña temporal (~24h)', async () => {
    const antes = new Date();
    await adminService.createAdmin({ email: 'nuevo@udesa.edu.ar', role: 'moderator' }, 'superadmin-uuid');
    const despues = new Date();

    const { tempPasswordExpiresAt } = adminRepository.create.mock.calls[0][0];
    const min = new Date(antes.getTime() + 23 * 60 * 60 * 1000);
    const max = new Date(despues.getTime() + 25 * 60 * 60 * 1000);
    expect(tempPasswordExpiresAt.getTime()).toBeGreaterThanOrEqual(min.getTime());
    expect(tempPasswordExpiresAt.getTime()).toBeLessThanOrEqual(max.getTime());
  });

  it('pasa el id del SuperAdmin como createdBy al repositorio', async () => {
    await adminService.createAdmin({ email: 'nuevo@udesa.edu.ar', role: 'moderator' }, 'superadmin-uuid');

    expect(adminRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: 'superadmin-uuid' })
    );
  });

  it('envía el email con la contraseña temporal', async () => {
    await adminService.createAdmin({ email: 'nuevo@udesa.edu.ar', role: 'moderator' }, 'superadmin-uuid');
    await Promise.resolve();

    expect(sendTempPasswordEmail).toHaveBeenCalledWith('nuevo@udesa.edu.ar', expect.any(String));
  });

  it('no falla si el envío del email falla', async () => {
    sendTempPasswordEmail.mockRejectedValue(new Error('SMTP caído'));

    await expect(
      adminService.createAdmin({ email: 'nuevo@udesa.edu.ar', role: 'moderator' }, 'superadmin-uuid')
    ).resolves.toBeDefined();
  });

  it('lanza error 409 si el email ya está en uso', async () => {
    adminRepository.findByEmail.mockResolvedValue(ADMIN_DB);

    await expect(
      adminService.createAdmin({ email: 'admin@udesa.edu.ar', role: 'moderator' }, 'superadmin-uuid')
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(adminRepository.create).not.toHaveBeenCalled();
  });

  it('lanza error 400 si el email no pertenece al dominio autorizado', async () => {
    env.ALLOWED_EMAIL_DOMAIN = 'udesa.edu.ar';

    await expect(
      adminService.createAdmin({ email: 'otro@gmail.com', role: 'moderator' }, 'superadmin-uuid')
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(adminRepository.create).not.toHaveBeenCalled();
  });

  it('no restringe dominio si ALLOWED_EMAIL_DOMAIN está vacío', async () => {
    env.ALLOWED_EMAIL_DOMAIN = '';

    await expect(
      adminService.createAdmin({ email: 'libre@gmail.com', role: 'moderator' }, 'superadmin-uuid')
    ).resolves.toBeDefined();
  });

  it('acepta email del dominio autorizado sin error', async () => {
    env.ALLOWED_EMAIL_DOMAIN = 'udesa.edu.ar';

    await expect(
      adminService.createAdmin({ email: 'nuevo@udesa.edu.ar', role: 'moderator' }, 'superadmin-uuid')
    ).resolves.toBeDefined();
  });

  it('lanza una instancia de AppError (no Error genérico)', async () => {
    adminRepository.findByEmail.mockResolvedValue(ADMIN_DB);

    await expect(
      adminService.createAdmin({ email: 'admin@udesa.edu.ar', role: 'moderator' }, 'superadmin-uuid')
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ─── resetAdminPassword ───────────────────────────────────────────────────────

describe('adminService.resetAdminPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    adminRepository.findById.mockResolvedValue(ADMIN_DB);
    bcrypt.hash.mockResolvedValue('nuevo-hash-temporal');
    uuidv4.mockReturnValue('aaaabbbb-cccc-dddd-eeee-ffffgggghhhh');
    adminRepository.updateTempPassword.mockResolvedValue();
    sendTempPasswordEmail.mockResolvedValue();
  });

  it('regenera la contraseña temporal y devuelve la nueva', async () => {
    const result = await adminService.resetAdminPassword('admin-uuid-1', 'superadmin-uuid');

    expect(result.temp_password).toBeDefined();
    expect(result.temp_password_expires_at).toBeInstanceOf(Date);
    expect(result.message).toBeDefined();
  });

  it('llama a updateTempPassword con el nuevo hash y fecha de expiración', async () => {
    await adminService.resetAdminPassword('admin-uuid-1', 'superadmin-uuid');

    expect(adminRepository.updateTempPassword).toHaveBeenCalledWith(
      'admin-uuid-1',
      'nuevo-hash-temporal',
      expect.any(Date)
    );
  });

  it('envía el email con la nueva contraseña temporal', async () => {
    await adminService.resetAdminPassword('admin-uuid-1', 'superadmin-uuid');
    await Promise.resolve();

    expect(sendTempPasswordEmail).toHaveBeenCalledWith('admin@udesa.edu.ar', expect.any(String));
  });

  it('no falla si el envío del email falla', async () => {
    sendTempPasswordEmail.mockRejectedValue(new Error('SMTP caído'));

    await expect(
      adminService.resetAdminPassword('admin-uuid-1', 'superadmin-uuid')
    ).resolves.toBeDefined();
  });

  it('lanza error 404 si el admin objetivo no existe', async () => {
    adminRepository.findById.mockResolvedValue(null);

    await expect(
      adminService.resetAdminPassword('no-existe', 'superadmin-uuid')
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(adminRepository.updateTempPassword).not.toHaveBeenCalled();
  });

  it('lanza error 400 si el SuperAdmin intenta resetear su propia contraseña', async () => {
    await expect(
      adminService.resetAdminPassword('mismo-uuid', 'mismo-uuid')
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(adminRepository.updateTempPassword).not.toHaveBeenCalled();
  });
});
