const { userController } = require('../../src/modules/users/user.controller');
const { usersClient } = require('../../src/clients/usersClient');
const { AppError } = require('../../src/middlewares/errorHandler');
const { query } = require('../../src/config/database');

jest.mock('../../src/clients/usersClient', () => ({
  usersClient: {
    resolveUserReview: jest.fn(),
    exportUsers: jest.fn(),
  },
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

const USER_ID = 'user-uuid-1';

function makeReq(overrides = {}) {
  return { admin: { sub: 'admin-uuid-1' }, params: { id: USER_ID }, body: {}, ...overrides };
}
function makeRes() {
  return { json: jest.fn() };
}
function makeNext() {
  return jest.fn();
}

// H9: userController.resolveReview
describe('userController.resolveReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usersClient.resolveUserReview.mockResolvedValue({ message: 'Revisión resuelta. El usuario puede volver a iniciar sesión.' });
  });

  it('llama a resolveUserReview en el usersClient con el id del usuario', async () => {
    const req = makeReq();
    await userController.resolveReview(req, makeRes(), makeNext());
    expect(usersClient.resolveUserReview).toHaveBeenCalledWith(USER_ID);
  });

  it('registra la acción en moderation_actions con acción resolve_review', async () => {
    const req = makeReq({ body: { reason: 'Falsa alarma' } });
    await userController.resolveReview(req, makeRes(), makeNext());
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('resolve_review'),
      ['admin-uuid-1', USER_ID, 'Falsa alarma']
    );
  });

  it('guarda reason null si no se envía motivo', async () => {
    const req = makeReq();
    await userController.resolveReview(req, makeRes(), makeNext());
    expect(query).toHaveBeenCalledWith(expect.any(String), ['admin-uuid-1', USER_ID, null]);
  });

  it('devuelve la respuesta del usersClient', async () => {
    const expectedResponse = { message: 'Revisión resuelta. El usuario puede volver a iniciar sesión.' };
    usersClient.resolveUserReview.mockResolvedValue(expectedResponse);
    const res = makeRes();
    await userController.resolveReview(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(expectedResponse);
  });

  it('llama a next con el error si usersClient.resolveUserReview rechaza con 400', async () => {
    usersClient.resolveUserReview.mockRejectedValue(new AppError(400, 'El usuario no está en revisión'));
    const next = makeNext();
    await userController.resolveReview(makeReq({ params: { id: USER_ID } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('llama a next con el error si usersClient.resolveUserReview rechaza con 410', async () => {
    usersClient.resolveUserReview.mockRejectedValue(new AppError(410, 'Usuario no encontrado'));
    const next = makeNext();
    await userController.resolveReview(makeReq({ params: { id: USER_ID } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 410 }));
  });

  it('llama a next con errores inesperados (resolveReview)', async () => {
    usersClient.resolveUserReview.mockRejectedValue(new Error('Service error'));
    const next = makeNext();
    await userController.resolveReview(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// H8: exportar CSV de usuarios
describe('userController.exportCsv', () => {
  const mockUsers = [
    { id: 'uuid-1', username: 'alice', email: 'alice@test.com', is_verified: true,  is_suspended: false, under_review: false, deleted_at: null,          created_at: '2026-01-01T00:00:00Z' },
    { id: 'uuid-2', username: 'bob',   email: 'bob@test.com',   is_verified: false, is_suspended: true,  under_review: false, deleted_at: null,          created_at: '2026-02-01T00:00:00Z' },
    { id: 'uuid-3', username: 'carol', email: 'carol@test.com', is_verified: true,  is_suspended: false, under_review: true,  deleted_at: null,          created_at: '2026-03-01T00:00:00Z' },
    { id: 'uuid-4', username: 'dave',  email: 'dave@test.com',  is_verified: false, is_suspended: false, under_review: false, deleted_at: null,          created_at: '2026-04-01T00:00:00Z' },
    { id: 'uuid-5', username: 'eve',   email: 'eve@test.com',   is_verified: true,  is_suspended: false, under_review: false, deleted_at: '2026-05-01Z', created_at: '2026-05-01T00:00:00Z' },
  ];

  function makeExportReq(search = '') {
    return { query: { search }, admin: { sub: 'admin-uuid-1' } };
  }
  function makeExportRes() {
    return { setHeader: jest.fn(), send: jest.fn() };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    usersClient.exportUsers.mockResolvedValue({ users: mockUsers });
  });

  it('CA.1: el CSV incluye la cabecera con las 5 columnas requeridas', async () => {
    const res = makeExportRes();
    await userController.exportCsv(makeExportReq(), res, makeNext());
    const csv = res.send.mock.calls[0][0];
    expect(csv.split('\n')[0]).toBe('ID,Username,Email,Estado,Fecha de Registro');
  });

  it('CA.1: cada fila tiene exactamente 5 columnas separadas por coma', async () => {
    const res = makeExportRes();
    await userController.exportCsv(makeExportReq(), res, makeNext());
    const lines = res.send.mock.calls[0][0].split('\n').slice(1);
    lines.forEach(line => expect(line.split(',').length).toBe(5));
  });

  it('CA.1: asigna "Activo" a usuario verificado sin problemas', async () => {
    const res = makeExportRes();
    await userController.exportCsv(makeExportReq(), res, makeNext());
    expect(res.send.mock.calls[0][0]).toContain('alice@test.com,Activo');
  });

  it('CA.1: asigna "Suspendido" a usuario is_suspended=true', async () => {
    const res = makeExportRes();
    await userController.exportCsv(makeExportReq(), res, makeNext());
    expect(res.send.mock.calls[0][0]).toContain('bob@test.com,Suspendido');
  });

  it('CA.1: asigna "En revision" a usuario under_review=true', async () => {
    const res = makeExportRes();
    await userController.exportCsv(makeExportReq(), res, makeNext());
    expect(res.send.mock.calls[0][0]).toContain('carol@test.com,En revision');
  });

  it('CA.1: asigna "Sin verificar" a usuario no verificado y sin otros problemas', async () => {
    const res = makeExportRes();
    await userController.exportCsv(makeExportReq(), res, makeNext());
    expect(res.send.mock.calls[0][0]).toContain('dave@test.com,Sin verificar');
  });

  it('CA.1: asigna "Eliminado" a usuario con deleted_at definido', async () => {
    const res = makeExportRes();
    await userController.exportCsv(makeExportReq(), res, makeNext());
    expect(res.send.mock.calls[0][0]).toContain('eve@test.com,Eliminado');
  });

  it('setea Content-Type text/csv y Content-Disposition attachment', async () => {
    const res = makeExportRes();
    await userController.exportCsv(makeExportReq(), res, makeNext());
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="usuarios.csv"');
  });

  it('pasa el parámetro search a usersClient.exportUsers', async () => {
    await userController.exportCsv(makeExportReq('juan'), makeExportRes(), makeNext());
    expect(usersClient.exportUsers).toHaveBeenCalledWith({ search: 'juan' });
  });

  it('usa string vacío como search si no se proporciona', async () => {
    await userController.exportCsv({ query: {} }, makeExportRes(), makeNext());
    expect(usersClient.exportUsers).toHaveBeenCalledWith({ search: '' });
  });

  it('CA.2: llama a next con el error si usersClient.exportUsers rechaza', async () => {
    usersClient.exportUsers.mockRejectedValue(new AppError(502, 'users service down'));
    const next = makeNext();
    await userController.exportCsv(makeExportReq(), makeExportRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 502 }));
  });
});
