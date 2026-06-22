const { internalReportsController } = require('../../src/modules/reports/internal.controller');
const { query } = require('../../src/config/database');

jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

function makeReq(body) {
  return { body };
}
function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}
function makeNext() {
  return jest.fn();
}

const VALID_BODY = {
  reporterId: 'reporter-uuid',
  reporterUsername: 'reporter_user',
  reportedId: 'reported-uuid',
  reportedUsername: 'reported_user',
  reason: 'harassment',
  createdAt: '2026-06-21T00:00:00.000Z',
};

describe('internalReportsController.receiveReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserta la denuncia en user_reports', async () => {
    const res = makeRes();
    await internalReportsController.receiveReport(makeReq(VALID_BODY), res, makeNext());

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_reports'),
      [
        VALID_BODY.reporterId,
        VALID_BODY.reporterUsername,
        VALID_BODY.reportedId,
        VALID_BODY.reportedUsername,
        VALID_BODY.reason,
        VALID_BODY.createdAt,
      ]
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'Denuncia registrada' });
  });

  it('llama a next con 400 si falta reporterId', async () => {
    const next = makeNext();
    await internalReportsController.receiveReport(
      makeReq({ ...VALID_BODY, reporterId: undefined }),
      makeRes(),
      next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('llama a next con 400 si falta reportedUsername', async () => {
    const next = makeNext();
    await internalReportsController.receiveReport(
      makeReq({ ...VALID_BODY, reportedUsername: undefined }),
      makeRes(),
      next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('llama a next con 400 si falta reason', async () => {
    const next = makeNext();
    await internalReportsController.receiveReport(
      makeReq({ ...VALID_BODY, reason: undefined }),
      makeRes(),
      next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
