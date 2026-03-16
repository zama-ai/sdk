Date.now = vi.fn(() => new Date(Date.UTC(2024, 0, 1)).valueOf());

afterEach(() => vi.restoreAllMocks());
