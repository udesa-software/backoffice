jest.mock('../../src/config/env', () => ({
  env: { INTERNAL_SECRET: 'test-internal-secret' },
}));

const { authenticateInternal } = require('../../src/middlewares/authenticateInternal');

function makeReq(headers = {}) {
  return { headers };
}
function makeNext() {
  return jest.fn();
}

describe('authenticateInternal', () => {
  it('llama a next() sin error si el secreto coincide', () => {
    const next = makeNext();
    authenticateInternal(makeReq({ 'x-internal-secret': 'test-internal-secret' }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('llama a next con 401 si falta el header', () => {
    const next = makeNext();
    authenticateInternal(makeReq(), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('llama a next con 401 si el secreto no coincide', () => {
    const next = makeNext();
    authenticateInternal(makeReq({ 'x-internal-secret': 'wrong-secret' }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
