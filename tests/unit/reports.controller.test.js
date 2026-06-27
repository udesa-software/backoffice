const { reportsController } = require('../../src/modules/reports/reports.controller');
const { friendsClient } = require('../../src/clients/friendsClient');
const { usersClient } = require('../../src/clients/usersClient');
const { AppError } = require('../../src/middlewares/errorHandler');
const { query } = require('../../src/config/database');

jest.mock('../../src/clients/friendsClient', () => ({
  friendsClient: {
    getReports:          jest.fn(),
    markReportsDiscarded: jest.fn(),
    markReportsResolved:  jest.fn(),
  },
}));

jest.mock('../../src/clients/usersClient', () => ({
  usersClient: {
    suspendUser:       jest.fn(),
    resolveUserReview: jest.fn(),
  },
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

const REPORTED_ID = 'reported-uuid-1';
const ADMIN_ID    = 'admin-uuid-1';

const SAMPLE_RESPONSE = {
  groups: [
    {
      reported_id:        REPORTED_ID,
      reported_username:  'usuario_denunciado',
      total_reports:      3,
      distinct_reporters: 3,
      last_reported_at:   '2026-06-25T10:00:00.000Z',
      reports: [
        { id: 'rep-1', reporter_username: 'user1', reason: 'spam', reason_detail: null, reported_at: '2026-06-25T10:00:00.000Z' },
      ],
    },
  ],
  total: 1,
  page:  1,
  limit: 20,
};

function makeReq(overrides = {}) {
  return {
    admin:  { sub: ADMIN_ID },
    params: { reportedId: REPORTED_ID },
    body:   {},
    query:  {},
    ...overrides,
  };
}
function makeRes() { return { json: jest.fn() }; }
function makeNext() { return jest.fn(); }

// ─── list ─────────────────────────────────────────────────────────────────────

describe('reportsController.list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    friendsClient.getReports.mockResolvedValue(SAMPLE_RESPONSE);
  });

  it('devuelve la respuesta de friendsClient tal cual', async () => {
    const res = makeRes();
    await reportsController.list(makeReq(), res, makeNext());

    expect(res.json).toHaveBeenCalledWith(SAMPLE_RESPONSE);
  });

  it('llama a friendsClient.getReports con page y limit parseados desde query string', async () => {
    await reportsController.list(makeReq({ query: { page: '2', limit: '10' } }), makeRes(), makeNext());

    expect(friendsClient.getReports).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it('usa page=1 y limit=20 por defecto si no se pasan query params', async () => {
    await reportsController.list(makeReq({ query: {} }), makeRes(), makeNext());

    expect(friendsClient.getReports).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('llama a next con el error si friendsClient falla', async () => {
    friendsClient.getReports.mockRejectedValue(new Error('friends service error'));
    const next = makeNext();
    await reportsController.list(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ─── discard ──────────────────────────────────────────────────────────────────

describe('reportsController.discard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    friendsClient.markReportsDiscarded.mockResolvedValue({ message: 'Denuncias descartadas.' });
    usersClient.resolveUserReview.mockResolvedValue({ message: 'Revisión resuelta.' });
  });

  it('llama a friendsClient.markReportsDiscarded con el reportedId', async () => {
    await reportsController.discard(makeReq(), makeRes(), makeNext());
    expect(friendsClient.markReportsDiscarded).toHaveBeenCalledWith(REPORTED_ID);
  });

  it('llama a usersClient.resolveUserReview para limpiar el under_review', async () => {
    await reportsController.discard(makeReq(), makeRes(), makeNext());
    expect(usersClient.resolveUserReview).toHaveBeenCalledWith(REPORTED_ID);
  });

  it('registra la acción "discard_reports" en moderation_actions', async () => {
    await reportsController.discard(makeReq(), makeRes(), makeNext());
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('discard_reports'),
      [ADMIN_ID, REPORTED_ID]
    );
  });

  it('devuelve un mensaje de confirmación', async () => {
    const res = makeRes();
    await reportsController.discard(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it('llama a next con el error si friendsClient falla', async () => {
    friendsClient.markReportsDiscarded.mockRejectedValue(new Error('friends service error'));
    const next = makeNext();
    await reportsController.discard(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('no propaga el error de resolveUserReview a next (fire-and-forget)', async () => {
    usersClient.resolveUserReview.mockRejectedValue(new AppError(502, 'users service down'));
    const next = makeNext();
    const res = makeRes();
    await reportsController.discard(makeReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });
});

// ─── suspend ──────────────────────────────────────────────────────────────────

describe('reportsController.suspend', () => {
  const REASON = 'Acoso reiterado a otros usuarios';

  beforeEach(() => {
    jest.clearAllMocks();
    friendsClient.markReportsResolved.mockResolvedValue({ message: 'Caso resuelto.' });
    usersClient.suspendUser.mockResolvedValue({ message: 'Usuario suspendido' });
  });

  it('lanza 400 si no se envía motivo', async () => {
    const next = makeNext();
    await reportsController.suspend(makeReq({ body: {} }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(usersClient.suspendUser).not.toHaveBeenCalled();
  });

  it('lanza 400 si el motivo es solo espacios en blanco', async () => {
    const next = makeNext();
    await reportsController.suspend(makeReq({ body: { reason: '   ' } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('llama a usersClient.suspendUser con el id del usuario', async () => {
    await reportsController.suspend(makeReq({ body: { reason: REASON } }), makeRes(), makeNext());
    expect(usersClient.suspendUser).toHaveBeenCalledWith(REPORTED_ID);
  });

  it('llama a friendsClient.markReportsResolved con el reportedId', async () => {
    await reportsController.suspend(makeReq({ body: { reason: REASON } }), makeRes(), makeNext());
    expect(friendsClient.markReportsResolved).toHaveBeenCalledWith(REPORTED_ID);
  });

  it('registra la acción "suspend_from_reports" con el motivo en moderation_actions', async () => {
    await reportsController.suspend(makeReq({ body: { reason: REASON } }), makeRes(), makeNext());
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('suspend_from_reports'),
      [ADMIN_ID, REPORTED_ID, REASON]
    );
  });

  it('devuelve un mensaje de confirmación', async () => {
    const res = makeRes();
    await reportsController.suspend(makeReq({ body: { reason: REASON } }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it('llama a next con el error si suspendUser falla', async () => {
    usersClient.suspendUser.mockRejectedValue(new AppError(404, 'Usuario no encontrado'));
    const next = makeNext();
    await reportsController.suspend(makeReq({ body: { reason: REASON } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('llama a next con el error si friendsClient falla', async () => {
    usersClient.suspendUser.mockResolvedValue({ message: 'ok' });
    friendsClient.markReportsResolved.mockRejectedValue(new Error('friends service error'));
    const next = makeNext();
    await reportsController.suspend(makeReq({ body: { reason: REASON } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ─── resolve ──────────────────────────────────────────────────────────────────

describe('reportsController.resolve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    friendsClient.markReportsResolved.mockResolvedValue({ message: 'Caso resuelto.' });
    usersClient.resolveUserReview.mockResolvedValue({ message: 'Revisión resuelta.' });
  });

  it('llama a friendsClient.markReportsResolved con el reportedId', async () => {
    await reportsController.resolve(makeReq(), makeRes(), makeNext());
    expect(friendsClient.markReportsResolved).toHaveBeenCalledWith(REPORTED_ID);
  });

  it('llama a usersClient.resolveUserReview para limpiar el under_review', async () => {
    await reportsController.resolve(makeReq(), makeRes(), makeNext());
    expect(usersClient.resolveUserReview).toHaveBeenCalledWith(REPORTED_ID);
  });

  it('registra la acción "resolve_reports" en moderation_actions', async () => {
    await reportsController.resolve(makeReq(), makeRes(), makeNext());
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('resolve_reports'),
      [ADMIN_ID, REPORTED_ID]
    );
  });

  it('devuelve un mensaje de confirmación', async () => {
    const res = makeRes();
    await reportsController.resolve(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it('llama a next con el error si friendsClient falla', async () => {
    friendsClient.markReportsResolved.mockRejectedValue(new Error('friends service error'));
    const next = makeNext();
    await reportsController.resolve(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('no propaga el error de resolveUserReview a next (fire-and-forget)', async () => {
    usersClient.resolveUserReview.mockRejectedValue(new AppError(504, 'Timeout'));
    const next = makeNext();
    const res = makeRes();
    await reportsController.resolve(makeReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });
});
