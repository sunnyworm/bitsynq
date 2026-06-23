import { beforeEach, describe, expect, it, vi } from 'vitest';
import wealthRoutes from './wealth';
import app from '../index';

const { mockUploadTranscript, mockAnchorHash } = vi.hoisted(() => ({
	mockUploadTranscript: vi.fn(),
	mockAnchorHash: vi.fn(),
}));

vi.mock('../middleware/auth', async () => {
	const actual = await vi.importActual<typeof import('../middleware/auth')>('../middleware/auth');
	return {
		...actual,
		verifyToken: vi.fn(async () => ({ sub: 'user-1' })),
		generateId: vi.fn(() => 'generated-id'),
	};
});

vi.mock('../services/storage', () => ({
	StorageService: vi.fn().mockImplementation(() => ({ uploadTranscript: mockUploadTranscript })),
}));

vi.mock('../services/ethereum', () => ({ anchorHash: mockAnchorHash }));

function createMockDb() {
	return {
		prepare: vi.fn(() => ({
			bind: vi.fn().mockReturnThis(),
			first: vi.fn(),
			all: vi.fn(),
			run: vi.fn(),
		})),
	};
}

function createMockStatement() {
	return {
		bind: vi.fn().mockReturnThis(),
		first: vi.fn(),
		all: vi.fn(),
		run: vi.fn(async () => ({ success: true })),
	};
}

function createMockKv(): KVNamespace & {
	get: ReturnType<typeof vi.fn>;
	getWithMetadata: ReturnType<typeof vi.fn>;
	put: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	list: ReturnType<typeof vi.fn>;
} {
	return {
		get: vi.fn(),
		getWithMetadata: vi.fn(),
		put: vi.fn(async () => undefined),
		delete: vi.fn(async () => undefined),
		list: vi.fn(),
	} as unknown as KVNamespace & {
		get: ReturnType<typeof vi.fn>;
		getWithMetadata: ReturnType<typeof vi.fn>;
		put: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
		list: ReturnType<typeof vi.fn>;
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockUploadTranscript.mockResolvedValue('meetings:generated-id:transcript');
	mockAnchorHash.mockResolvedValue({ success: true, txHash: '0xtx-123' });
});

describe('wealth routes', () => {
	it('rejects invalid deal payloads', async () => {
		const res = await wealthRoutes.request('http://test/deals', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: '' }),
		}, { DB: createMockDb(), JWT_SECRET: 'secret', SESSION_KV: {} as KVNamespace, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(400);
	});

	it('creates a deal and returns the persisted payload', async () => {
		const db = createMockDb();
		const insertStatement = createMockStatement();
		const insertAuditStatement = createMockStatement();
		db.prepare.mockReturnValueOnce(insertStatement).mockReturnValueOnce(insertAuditStatement);
		const res = await wealthRoutes.request('http://test/deals', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'B3 Fractional Deal', property_address: 'Taipei City', token_symbol: 'WB3' }),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: {} as KVNamespace, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({
			id: 'generated-id',
			name: 'B3 Fractional Deal',
			property_address: 'Taipei City',
			token_symbol: 'WB3',
			owner_id: 'user-1',
			signing_status: 'pending',
			mint_status: 'not_started',
			created_at: expect.any(String),
			updated_at: expect.any(String),
		});
		expect(db.prepare).toHaveBeenCalledTimes(2);
		expect(insertAuditStatement.bind).toHaveBeenCalledWith(
			'generated-id',
			'generated-id',
			null,
			'deal_created',
			expect.stringContaining('B3 Fractional Deal'),
			expect.any(String)
		);
	});

	it('returns a deal with participants signatures ownership rows and audit events', async () => {
		const db = createMockDb();
		const dealStatement = createMockStatement();
		const participantsStatement = createMockStatement();
		const signaturesStatement = createMockStatement();
		const ownershipStatement = createMockStatement();
		const auditEventsStatement = createMockStatement();
		dealStatement.first.mockResolvedValue({ id: 'deal-1', name: 'B3 Fractional Deal', property_address: 'Taipei City', token_symbol: 'WB3', owner_id: 'user-1', signing_status: 'completed', mint_status: 'pending', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' });
		participantsStatement.all.mockResolvedValue({ results: [{ id: 'participant-1', deal_id: 'deal-1', display_name: 'Signer One', email: 'signer@example.com', wallet_address: null, role: 'signer', signing_status: 'completed', created_at: '2026-01-01T00:00:00.000Z' }] });
		signaturesStatement.all.mockResolvedValue({ results: [{ id: 'signature-1', deal_id: 'deal-1', participant_id: 'participant-1', document_name: 'Purchase Agreement', document_hash: 'sha256-abc123', provider: 'docusign', envelope_id: 'env-456', evidence_key: 'deal-1/participant-1/evidence', completed_at: '2026-01-02T00:00:00.000Z' }] });
		ownershipStatement.all.mockResolvedValue({ results: [{ id: 'ledger-1', deal_id: 'deal-1', participant_id: 'participant-1', asset_id: 77, amount: '1.5', tx_hash: null, status: 'pending', created_at: '2026-01-03T00:00:00.000Z' }] });
		auditEventsStatement.all.mockResolvedValue({ results: [{ id: 'audit-1', deal_id: 'deal-1', participant_id: 'participant-1', event_type: 'signing_completed', payload_json: '{"provider":"docusign"}', created_at: '2026-01-02T00:00:00.000Z' }] });
		db.prepare.mockReturnValueOnce(dealStatement).mockReturnValueOnce(participantsStatement).mockReturnValueOnce(signaturesStatement).mockReturnValueOnce(ownershipStatement).mockReturnValueOnce(auditEventsStatement);
		const res = await wealthRoutes.request('http://test/deals/deal-1', { method: 'GET', headers: { Authorization: 'Bearer test-token' } }, { DB: db, JWT_SECRET: 'secret', SESSION_KV: {} as KVNamespace, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(200);
		const data: any = await res.json();
		expect(data.participants).toHaveLength(1);
		expect(data.signatures).toHaveLength(1);
		expect(data.ownership).toHaveLength(1);
		expect(data.audit_events).toHaveLength(1);
	});

	it('persists a mint ledger row and returns it when signing is completed', async () => {
		const db = createMockDb();
		const selectDealStatement = createMockStatement();
		const selectParticipantStatement = createMockStatement();
		const insertLedgerStatement = createMockStatement();
		const updateDealStatement = createMockStatement();
		const insertAuditStatement = createMockStatement();
		selectDealStatement.first.mockResolvedValue({ signing_status: 'completed' });
		selectParticipantStatement.first.mockResolvedValue({ id: 'participant-1' });
		db.prepare.mockReturnValueOnce(selectDealStatement).mockReturnValueOnce(selectParticipantStatement).mockReturnValueOnce(insertLedgerStatement).mockReturnValueOnce(updateDealStatement).mockReturnValueOnce(insertAuditStatement);
		const res = await wealthRoutes.request('http://test/deals/deal-1/mint', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ participant_id: 'participant-1', asset_id: 77, amount: '1.5' }),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: {} as KVNamespace, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(200);
		const data: any = await res.json();
		expect(data.status).toBe('pending');
		expect(insertAuditStatement.bind).toHaveBeenCalledWith(
			'generated-id',
			'deal-1',
			'participant-1',
			'mint_recorded',
			expect.stringContaining('"asset_id":77'),
			expect.any(String)
		);
	});

	it('returns a minted ledger row with tx hash when on-chain mint succeeds', async () => {
		const db = createMockDb();
		const selectDealStatement = createMockStatement();
		const selectParticipantStatement = createMockStatement();
		const insertLedgerStatement = createMockStatement();
		const updateDealStatement = createMockStatement();
		selectDealStatement.first.mockResolvedValue({ signing_status: 'completed' });
		selectParticipantStatement.first.mockResolvedValue({ id: 'participant-1' });
		db.prepare.mockReturnValueOnce(selectDealStatement).mockReturnValueOnce(selectParticipantStatement).mockReturnValueOnce(insertLedgerStatement).mockReturnValueOnce(updateDealStatement);
		const res = await wealthRoutes.request('http://test/deals/deal-1/mint', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ participant_id: 'participant-1', asset_id: 77, amount: '1.5', on_chain: true }),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: {} as KVNamespace, EVIDENCE_KV: {} as KVNamespace, ETH_PRIVATE_KEY: 'eth-private-key', ETH_RPC_URL: 'https://rpc.example' } as any);
		expect(res.status).toBe(200);
		const data: any = await res.json();
		expect(data.status).toBe('minted');
		expect(mockAnchorHash).toHaveBeenCalled();
	});

	it('creates a participant and returns the persisted payload', async () => {
		const db = createMockDb();
		const selectDealStatement = createMockStatement();
		const insertStatement = createMockStatement();
		const insertAuditStatement = createMockStatement();
		selectDealStatement.first.mockResolvedValue({ id: 'deal-1' });
		db.prepare.mockReturnValueOnce(selectDealStatement).mockReturnValueOnce(insertStatement).mockReturnValueOnce(insertAuditStatement);
		const res = await wealthRoutes.request('http://test/deals/deal-1/participants', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ display_name: 'Signer One', email: 'signer@example.com', role: 'signer' }),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: {} as KVNamespace, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(201);
		const data: any = await res.json();
		expect(data.role).toBe('signer');
		expect(data.share_pct).toBe(0.0);
		expect(data.cash_amount).toBe('0');
		expect(data.loan_amount).toBe('0');
		expect(insertStatement.bind).toHaveBeenCalledWith(
			'generated-id',
			'deal-1',
			'Signer One',
			'signer@example.com',
			null,
			'signer',
			'pending',
			0.0,
			'0',
			'0',
			expect.any(String)
		);
		expect(insertAuditStatement.bind).toHaveBeenCalledWith(
			'generated-id',
			'deal-1',
			'generated-id',
			'participant_added',
			expect.stringContaining('Signer One'),
			expect.any(String)
		);
	});

	it('creates a participant with custom ratios and returns the persisted payload', async () => {
		const db = createMockDb();
		const selectDealStatement = createMockStatement();
		const insertStatement = createMockStatement();
		const insertAuditStatement = createMockStatement();
		selectDealStatement.first.mockResolvedValue({ id: 'deal-1' });
		db.prepare.mockReturnValueOnce(selectDealStatement).mockReturnValueOnce(insertStatement).mockReturnValueOnce(insertAuditStatement);
		const res = await wealthRoutes.request('http://test/deals/deal-1/participants', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({
				display_name: 'Signer Two',
				email: 'signer2@example.com',
				role: 'signer',
				share_pct: 12.5,
				cash_amount: '125000',
				loan_amount: '375000',
			}),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: {} as KVNamespace, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(201);
		const data: any = await res.json();
		expect(data.role).toBe('signer');
		expect(data.share_pct).toBe(12.5);
		expect(data.cash_amount).toBe('125000');
		expect(data.loan_amount).toBe('375000');
		expect(insertStatement.bind).toHaveBeenCalledWith(
			'generated-id',
			'deal-1',
			'Signer Two',
			'signer2@example.com',
			null,
			'signer',
			'pending',
			12.5,
			'125000',
			'375000',
			expect.any(String)
		);
		expect(insertAuditStatement.bind).toHaveBeenCalledWith(
			'generated-id',
			'deal-1',
			'generated-id',
			'participant_added',
			expect.stringContaining('"share_pct":12.5'),
			expect.any(String)
		);
	});

	it('creates a signer session in SESSION_KV for a deal participant', async () => {
		const db = createMockDb();
		const selectParticipantStatement = createMockStatement();
		const sessionKv = createMockKv();
		selectParticipantStatement.first.mockResolvedValue({ id: 'participant-1' });
		db.prepare.mockReturnValueOnce(selectParticipantStatement);
		const res = await wealthRoutes.request('http://test/deals/deal-1/signer-session', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ participant_id: 'participant-1' }),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: sessionKv, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({
			session_id: 'generated-id',
			deal_id: 'deal-1',
			participant_id: 'participant-1',
			status: 'initiated',
			created_at: expect.any(String),
			expires_at: expect.any(String),
		});
		expect(sessionKv.put).toHaveBeenCalledWith(
			'wealth:signer-session:generated-id',
			expect.any(String),
			expect.objectContaining({ expirationTtl: expect.any(Number) })
		);
	});

	it('prepares a wallet in SESSION_KV and records an audit event', async () => {
		const db = createMockDb();
		const insertAuditStatement = createMockStatement();
		const sessionKv = createMockKv();
		sessionKv.get.mockResolvedValue(JSON.stringify({ session_id: 'session-1', deal_id: 'deal-1', participant_id: 'participant-1', status: 'initiated' }));
		db.prepare.mockReturnValueOnce(insertAuditStatement);
		const res = await wealthRoutes.request('http://test/deals/deal-1/wallet-prep', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ participant_id: 'participant-1', session_id: 'session-1', wallet_address: '0xabc123' }),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: sessionKv, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(200);
		expect(sessionKv.put).toHaveBeenCalledWith(
			'wealth:signer-session:session-1',
			expect.stringContaining('0xabc123'),
			expect.objectContaining({ expirationTtl: expect.any(Number) })
		);
		expect(insertAuditStatement.bind).toHaveBeenCalledWith(
			'generated-id',
			'deal-1',
			'participant-1',
			'wallet_prepared',
			expect.stringContaining('0xabc123'),
			expect.any(String)
		);
	});

	it('starts signing from a prepared signer session and records an audit event', async () => {
		const db = createMockDb();
		const insertAuditStatement = createMockStatement();
		const sessionKv = createMockKv();
		sessionKv.get.mockResolvedValue(JSON.stringify({
			session_id: 'session-1',
			deal_id: 'deal-1',
			participant_id: 'participant-1',
			status: 'wallet_prepared',
			wallet_address: '0xabc123',
		}));
		db.prepare.mockReturnValueOnce(insertAuditStatement);
		const res = await wealthRoutes.request('http://test/deals/deal-1/signing/start', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ participant_id: 'participant-1', session_id: 'session-1', provider: 'demo-sign' }),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: sessionKv, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(200);
		expect(sessionKv.put).toHaveBeenCalledWith(
			'wealth:signer-session:session-1',
			expect.stringContaining('signing_started'),
			expect.objectContaining({ expirationTtl: expect.any(Number) })
		);
		expect(insertAuditStatement.bind).toHaveBeenCalledWith(
			'generated-id',
			'deal-1',
			'participant-1',
			'signing_started',
			expect.stringContaining('demo-sign'),
			expect.any(String)
		);
	});

	it('rejects signing completion when the signer session has not started signing', async () => {
		const db = createMockDb();
		const selectParticipantStatement = createMockStatement();
		const sessionKv = createMockKv();
		selectParticipantStatement.first.mockResolvedValue({ id: 'participant-1' });
		sessionKv.get.mockResolvedValue(JSON.stringify({
			session_id: 'session-1',
			deal_id: 'deal-1',
			participant_id: 'participant-1',
			status: 'wallet_prepared',
			wallet_address: '0xabc123',
		}));
		db.prepare.mockReturnValueOnce(selectParticipantStatement);
		const res = await wealthRoutes.request('http://test/deals/deal-1/signing/complete', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ participant_id: 'participant-1', session_id: 'session-1', document_name: 'Purchase Agreement', document_hash: 'sha256-abc123', provider: 'demo-sign' }),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: sessionKv, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: 'Signing has not been started for this session' });
	});

	it('completes signing with valid payload and updates participant and deal status', async () => {
		const db = createMockDb();
		const selectParticipantStatement = createMockStatement();
		const insertSignatureStmt = createMockStatement();
		const updateParticipantStmt = createMockStatement();
		const selectParticipantsStmt = createMockStatement();
		const updateDealStmt = createMockStatement();
		const insertAuditStmt = createMockStatement();
		const sessionKv = createMockKv();
		selectParticipantStatement.first.mockResolvedValue({ id: 'participant-1' });
		selectParticipantsStmt.all.mockResolvedValue({ results: [{ id: 'participant-1', signing_status: 'completed' }] });
		sessionKv.get.mockResolvedValue(JSON.stringify({
			session_id: 'session-1',
			deal_id: 'deal-1',
			participant_id: 'participant-1',
			status: 'signing_started',
			wallet_address: '0xabc123',
			signing_started_at: '2026-01-01T00:00:00.000Z',
		}));
		db.prepare.mockReturnValueOnce(selectParticipantStatement).mockReturnValueOnce(insertSignatureStmt).mockReturnValueOnce(updateParticipantStmt).mockReturnValueOnce(selectParticipantsStmt).mockReturnValueOnce(updateDealStmt).mockReturnValueOnce(insertAuditStmt);
		const res = await wealthRoutes.request('http://test/deals/deal-1/signing/complete', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ participant_id: 'participant-1', session_id: 'session-1', document_name: 'Purchase Agreement', document_hash: 'sha256-abc123', provider: 'docusign', envelope_id: 'env-456' }),
		}, { DB: db, JWT_SECRET: 'secret', SESSION_KV: sessionKv, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(200);
		expect(mockUploadTranscript).toHaveBeenCalledTimes(1);
		expect(insertAuditStmt.bind).toHaveBeenCalledWith(
			'generated-id',
			'deal-1',
			'participant-1',
			'signing_completed',
			expect.stringContaining('sha256-abc123'),
			expect.any(String)
		);
	});
});

describe('wealth routes integration (via app entrypoint)', () => {
	it('should reach wealth validation through /api/wealth', async () => {
		const res = await app.request('http://test/api/wealth/deals', {
			method: 'POST',
			headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Test Deal' }),
		}, { DB: createMockDb(), JWT_SECRET: 'secret', SESSION_KV: {} as KVNamespace, EVIDENCE_KV: {} as KVNamespace } as any);
		expect(res.status).toBe(400);
	});
});
