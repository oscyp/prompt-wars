const mockAuth = {
  getSession: jest.fn(),
  refreshSession: jest.fn(),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
};
jest.unmock('@/utils/supabase');
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: mockAuth })),
}));

let invocation: typeof import('@/utils/supabase');
let registration: typeof import('@/utils/registration');
const mockFetch = jest.fn();
const originalFetch = global.fetch;
function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}
beforeAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-key';
  invocation = jest.requireActual('@/utils/supabase');
  registration = jest.requireActual('@/utils/registration');
  global.fetch = mockFetch;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.getSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'current-private-access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    },
    error: null,
  });
  mockAuth.refreshSession.mockResolvedValue({
    data: { session: { access_token: 'new-private-access-token' } },
    error: null,
  });
  mockFetch.mockResolvedValue(response(200, { enabled: true }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  global.fetch = originalFetch;
});

it('calls public registration without reading a session or sending its bearer token', async () => {
  expect(await registration.getRegistrationConfiguration()).toEqual({
    enabled: true,
  });
  const [url, request] = mockFetch.mock.calls[0];
  expect(url).toBe('https://example.supabase.co/functions/v1/registration');
  expect(request.headers).toEqual({
    apikey: 'public-key',
    'Content-Type': 'application/json',
  });
  expect(JSON.parse(request.body)).toEqual({ action: 'config' });
  expect(mockAuth.getSession).not.toHaveBeenCalled();
  expect(mockAuth.refreshSession).not.toHaveBeenCalled();
});

it('cannot invoke gameplay through the registration exception', async () => {
  await expect(
    invocation.invokeAuthenticatedFunction(
      'matchmaking',
      {},
      { auth: 'registration' },
    ),
  ).rejects.toThrow('restricted to registration');
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockAuth.getSession).not.toHaveBeenCalled();
});

it('does not refresh a session or retry after a public registration 401', async () => {
  mockFetch.mockResolvedValue(
    response(401, { error: 'Expired registration token' }),
  );
  await expect(
    registration.checkRegistration('registration-secret'),
  ).rejects.toMatchObject({ status: 401 });
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockAuth.getSession).not.toHaveBeenCalled();
  expect(mockAuth.refreshSession).not.toHaveBeenCalled();
});

it('authorizes the native credential without sending account or profile metadata', async () => {
  await registration.authorizeRegistration('registration-secret', {
    provider: 'apple',
    idToken: 'apple-id-token',
    nonce: 'raw-nonce',
    authorizationCode: 'apple-authorization-code',
    expectedUserId: null,
  });
  const request = mockFetch.mock.calls[0][1];
  expect(JSON.parse(request.body)).toEqual({
    action: 'authorize',
    registration_token: 'registration-secret',
    provider: 'apple',
    id_token: 'apple-id-token',
    nonce: 'raw-nonce',
  });
  expect(request.headers.Authorization).toBeUndefined();
});

it.each(['registration', 'apple-authorization'])(
  'does not log sensitive %s request or response data on failure',
  async (name) => {
    const sensitive = {
      registration_token: 'private-registration-token',
      id_token: 'private-provider-token',
      authorization_code: 'private-apple-code',
      birth_date: '2010-04-05',
    };
    mockFetch.mockResolvedValue(
      response(400, { error: 'Request failed', ...sensitive }),
    );
    await expect(
      invocation.invokeAuthenticatedFunction(
        name,
        sensitive,
        name === 'registration' ? { auth: 'registration' } : undefined,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const logged = JSON.stringify((console.error as jest.Mock).mock.calls);
    for (const value of Object.values(sensitive))
      expect(logged).not.toContain(value);
    expect(logged).not.toContain('current-private-access-token');
    expect(logged).not.toContain('new-private-access-token');
    expect(console.error).toHaveBeenCalledWith(
      'Supabase function invoke failed',
      { functionName: name, status: 400 },
    );
  },
);

it('preserves standard authenticated 401 refresh and retry', async () => {
  mockFetch
    .mockResolvedValueOnce(response(401, { error: 'Token expired' }))
    .mockResolvedValueOnce(response(200, { can_purchase: true }));
  expect(await registration.getAccountEligibility()).toEqual({
    can_purchase: true,
  });
  expect(
    mockFetch.mock.calls.map(([, request]) => request.headers.Authorization),
  ).toEqual([
    'Bearer current-private-access-token',
    'Bearer new-private-access-token',
  ]);
  expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
});

it('requires a signed-in session for eligibility even while public registration is supported', async () => {
  mockAuth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  await expect(registration.getAccountEligibility()).rejects.toThrow(
    'signed in',
  );
  expect(mockFetch).not.toHaveBeenCalled();
});

it('never completes eligibility for a different account or retries using its token', async () => {
  const session = (id: string) => ({
    data: {
      session: {
        user: { id },
        access_token: `token-${id}`,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    },
    error: null,
  });
  mockAuth.getSession.mockResolvedValue(session('other'));
  await expect(
    registration.completeExistingEligibility('secret', 'intended'),
  ).rejects.toThrow('account changed');
  expect(mockFetch).not.toHaveBeenCalled();
  mockAuth.getSession
    .mockResolvedValueOnce(session('intended'))
    .mockResolvedValue(session('other'));
  mockFetch.mockResolvedValue(response(401, { error: 'Expired' }));
  await expect(
    registration.completeExistingEligibility('secret', 'intended'),
  ).rejects.toThrow('account changed');
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockAuth.refreshSession).not.toHaveBeenCalled();
});

it('authorizes guest creation without a fabricated email or social token', async () => {
  await registration.authorizeRegistration('registration-secret', {
    provider: 'anonymous',
  });
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
    action: 'authorize',
    registration_token: 'registration-secret',
    provider: 'anonymous',
  });
});
