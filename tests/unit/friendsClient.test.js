jest.mock('../../src/config/env', () => ({
  env: { FRIENDS_SERVICE_URL: 'http://friends:3001', INTERNAL_SECRET: 'test-internal-secret' },
}));

const { friendsClient } = require('../../src/clients/friendsClient');

global.fetch = jest.fn();

const REPORTED_ID = 'reported-uuid-1';

describe('friendsClient internal requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ message: 'ok' }),
    });
  });

  // H7: getReports — lista paginada de denuncias
  it('getReports envía GET con los query params correctos y el header x-internal-secret', async () => {
    await friendsClient.getReports({ page: 2, limit: 10 });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://friends:3001/internal/reports?page=2&limit=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'x-internal-secret': 'test-internal-secret' }),
      })
    );
  });

  // H7: markReportsDiscarded
  it('markReportsDiscarded envía POST a /internal/reports/:id/discard con x-internal-secret', async () => {
    await friendsClient.markReportsDiscarded(REPORTED_ID);

    expect(global.fetch).toHaveBeenCalledWith(
      `http://friends:3001/internal/reports/${REPORTED_ID}/discard`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-internal-secret': 'test-internal-secret' }),
      })
    );
  });

  // H7: markReportsResolved
  it('markReportsResolved envía POST a /internal/reports/:id/resolve con x-internal-secret', async () => {
    await friendsClient.markReportsResolved(REPORTED_ID);

    expect(global.fetch).toHaveBeenCalledWith(
      `http://friends:3001/internal/reports/${REPORTED_ID}/resolve`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-internal-secret': 'test-internal-secret' }),
      })
    );
  });

  it('lanza AppError con el status del servidor si la respuesta no es ok', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({ error: 'Service unavailable' }),
    });

    await expect(friendsClient.getReports({ page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('lanza AppError(504) si el fetch agota el tiempo (AbortError)', async () => {
    global.fetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    await expect(friendsClient.getReports({ page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 504,
    });
  });
});
