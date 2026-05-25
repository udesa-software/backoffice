const { userController } = require('../../src/modules/users/user.controller');
const { usersClient } = require('../../src/clients/usersClient');
const { AppError } = require('../../src/middlewares/errorHandler');

jest.mock('../../src/clients/usersClient', () => ({
  usersClient: {
    listUsers: jest.fn(),
    getUser: jest.fn(),
    suspendUser: jest.fn(),
    unsuspendUser: jest.fn(),
    resolveUserReview: jest.fn(),
  },
}));

// La query de la DB del backoffice (moderation_actions) se mockeamodulearmente
jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
}));

const { query } = require('../../src/config/database');

const ADMIN_ID  = 'admin-uuid-1';
const USER_ID   = 'user-uuid-1';

const makeReq = ({ params = {}, body = {}, query: q = {}, admin = { sub: ADMIN_ID } } = {}) => ({
  params,
  body,
  query: q,
  admin,
});

const makeRes = () => {
  const res = {};
  res.json   = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  return res;
};

const makeNext = () => jest.fn();

// ---------------------------------------------------------------------------
// H9: userController.resolveReview
// ---------------------------------------------------------------------------
describe('userController.resolveReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usersClient.resolveUserReview.mockResolvedValue({ message: 'Revisión resuelta. El usuario puede volver a iniciar sesión.' });
    query.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  // Caso exitoso
  it('llama a resolveUserReview en el usersClient con el id del usuario', async () => {
    const req = makeReq({ params: { id: USER_ID } });
    const res = makeRes();

    await userController.resolveReview(req, res, makeNext());

    expect(usersClient.resolveUserReview).toHaveBeenCalledWith(USER_ID);
  });

  it('registra la acción en moderation_actions con acción resolve_review', async () => {
    const req = makeReq({ params: { id: USER_ID }, body: { reason: 'Cuenta verificada correctamente' } });

    await userController.resolveReview(req, makeRes(), makeNext());

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('resolve_review'),
      expect.arrayContaining([ADMIN_ID, USER_ID, 'Cuenta verificada correctamente'])
    );
  });

  it('registra en moderation_actions aunque no se provea motivo (reason null)', async () => {
    const req = makeReq({ params: { id: USER_ID }, body: {} });

    await userController.resolveReview(req, makeRes(), makeNext());

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('moderation_actions'),
      expect.arrayContaining([ADMIN_ID, USER_ID, null])
    );
  });

  it('responde con el resultado del usersClient', async () => {
    const req = makeReq({ params: { id: USER_ID } });
    const res = makeRes();
    const expectedResponse = { message: 'Revisión resuelta. El usuario puede volver a iniciar sesión.' };
    usersClient.resolveUserReview.mockResolvedValue(expectedResponse);

    await userController.resolveReview(req, res, makeNext());

    expect(res.json).toHaveBeenCalledWith(expectedResponse);
  });

  it('no llama a next si la operación es exitosa', async () => {
    const req = makeReq({ params: { id: USER_ID } });
    const next = makeNext();

    await userController.resolveReview(req, makeRes(), next);

    expect(next).not.toHaveBeenCalled();
  });

  // Propagación de errores
  it('llama a next si usersClient lanza un error (usuario no en revisión)', async () => {
    usersClient.resolveUserReview.mockRejectedValue(new AppError(400, 'El usuario no está en revisión'));
    const next = makeNext();

    await userController.resolveReview(makeReq({ params: { id: USER_ID } }), makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('llama a next si usersClient lanza un error (usuario no encontrado)', async () => {
    usersClient.resolveUserReview.mockRejectedValue(new AppError(410, 'Usuario no encontrado'));
    const next = makeNext();

    await userController.resolveReview(makeReq({ params: { id: USER_ID } }), makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 410 }));
  });

  it('no llama a res.json si el usersClient falla', async () => {
    usersClient.resolveUserReview.mockRejectedValue(new Error('Service error'));
    const res = makeRes();

    await userController.resolveReview(makeReq({ params: { id: USER_ID } }), res, makeNext());

    expect(res.json).not.toHaveBeenCalled();
  });

  it('usa admin.sub del request como id del admin en el registro de auditoría', async () => {
    const OTRO_ADMIN = 'otro-admin-uuid';
    const req = makeReq({ params: { id: USER_ID }, admin: { sub: OTRO_ADMIN } });

    await userController.resolveReview(req, makeRes(), makeNext());

    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([OTRO_ADMIN])
    );
  });
});
