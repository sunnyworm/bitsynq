import { Hono } from 'hono';
import type {
	AddWealthParticipantRequest,
	CompleteWealthSigningRequest,
	CreateWealthDealRequest,
	Env,
	MintWealthOwnershipRequest,
	WealthAuditEvent,
	WealthDeal,
	WealthParticipant,
	WealthSignerSession,
} from '../types';
import { generateId, verifyToken } from '../middleware/auth';
import { anchorHash } from '../services/ethereum';
import { StorageService } from '../services/storage';
import { canMintOwnership, isWealthParticipantRole, validateCreateDealInput, validateParticipantInput } from '../services/wealth-domain';

type AuthContext = {
	Bindings: Env;
	Variables: { userId: string };
};

type WealthSignatureRow = {
	id: string;
	deal_id: string;
	participant_id: string;
	document_name: string;
	document_hash: string;
	provider: string;
	envelope_id: string | null;
	evidence_key: string | null;
	completed_at: string;
};

type WealthOwnershipRow = {
	id: string;
	deal_id: string;
	participant_id: string;
	asset_id: number;
	amount: string;
	tx_hash: string | null;
	status: string;
	created_at: string;
};

type SessionRequest = {
	participant_id: string;
	session_id?: string;
	wallet_address?: string;
	provider?: string;
	envelope_id?: string;
};

const SIGNER_SESSION_TTL_SECONDS = 60 * 60 * 24;

const wealth = new Hono<AuthContext>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function validationErrorBody(errors: string[]) {
	return { error: errors[0], errors };
}

function requiredStringError(fieldName: string, value: unknown): string | null {
	if (!isString(value) || !value.trim()) return `${fieldName} is required`;
	return null;
}

function getSignerSessionKey(sessionId: string): string {
	return `wealth:signer-session:${sessionId}`;
}

async function writeSignerSession(kv: KVNamespace, session: WealthSignerSession): Promise<void> {
	await kv.put(getSignerSessionKey(session.session_id), JSON.stringify(session), { expirationTtl: SIGNER_SESSION_TTL_SECONDS });
}

async function readSignerSession(kv: KVNamespace, sessionId: string): Promise<WealthSignerSession | null> {
	const raw = await kv.get(getSignerSessionKey(sessionId));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as WealthSignerSession;
	} catch {
		return null;
	}
}

async function insertAuditEvent(db: D1Database, input: { dealId: string; participantId: string | null; eventType: string; payload: Record<string, unknown>; createdAt: string }) {
	await db.prepare(`INSERT INTO wealth_audit_events (id, deal_id, participant_id, event_type, payload_json, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`).bind(
		generateId(),
		input.dealId,
		input.participantId,
		input.eventType,
		JSON.stringify(input.payload),
		input.createdAt
	).run();
}

async function sha256Hex(value: string): Promise<string> {
	const encoded = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', encoded);
	const hashBytes = Array.from(new Uint8Array(digest));
	const hashHex = hashBytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
	return `0x${hashHex}`;
}

function validateMintRequest(body: unknown): { valid: true; value: MintWealthOwnershipRequest } | { valid: false; errors: string[] } {
	if (!isRecord(body)) return { valid: false, errors: ['Request body must be a JSON object'] };
	const participantIdError = requiredStringError('participant_id', body.participant_id);
	if (participantIdError) return { valid: false, errors: [participantIdError] };
	const amountError = requiredStringError('amount', body.amount);
	if (amountError) return { valid: false, errors: [amountError] };
	if (typeof body.asset_id !== 'number' || Number.isNaN(body.asset_id)) return { valid: false, errors: ['asset_id is required'] };
	if (body.on_chain !== undefined && typeof body.on_chain !== 'boolean') return { valid: false, errors: ['on_chain must be a boolean'] };
	return {
		valid: true,
		value: {
			participant_id: typeof body.participant_id === 'string' ? body.participant_id.trim() : '',
			amount: typeof body.amount === 'string' ? body.amount.trim() : '',
			asset_id: body.asset_id,
			on_chain: body.on_chain,
		},
	};
}

function validateSigningRequest(body: unknown): { valid: true; value: CompleteWealthSigningRequest } | { valid: false; errors: string[] } {
	if (!isRecord(body)) return { valid: false, errors: ['Request body must be a JSON object'] };
	const participantIdError = requiredStringError('participant_id', body.participant_id);
	if (participantIdError) return { valid: false, errors: [participantIdError] };
	const sessionIdError = requiredStringError('session_id', body.session_id);
	if (sessionIdError) return { valid: false, errors: [sessionIdError] };
	const documentNameError = requiredStringError('document_name', body.document_name);
	if (documentNameError) return { valid: false, errors: [documentNameError] };
	const documentHashError = requiredStringError('document_hash', body.document_hash);
	if (documentHashError) return { valid: false, errors: [documentHashError] };
	const providerError = requiredStringError('provider', body.provider);
	if (providerError) return { valid: false, errors: [providerError] };
	if (body.envelope_id !== undefined && !isString(body.envelope_id)) return { valid: false, errors: ['envelope_id must be a string'] };
	return {
		valid: true,
		value: {
			participant_id: typeof body.participant_id === 'string' ? body.participant_id.trim() : '',
			session_id: typeof body.session_id === 'string' ? body.session_id.trim() : '',
			document_name: typeof body.document_name === 'string' ? body.document_name.trim() : '',
			document_hash: typeof body.document_hash === 'string' ? body.document_hash.trim() : '',
			provider: typeof body.provider === 'string' ? body.provider.trim() : '',
			envelope_id: isString(body.envelope_id) ? body.envelope_id.trim() : undefined,
		},
	};
}

function validateSessionRequest(body: unknown): { valid: true; value: SessionRequest } | { valid: false; errors: string[] } {
	if (!isRecord(body)) return { valid: false, errors: ['Request body must be a JSON object'] };
	const participantIdError = requiredStringError('participant_id', body.participant_id);
	if (participantIdError) return { valid: false, errors: [participantIdError] };
	if (body.session_id !== undefined && !isString(body.session_id)) return { valid: false, errors: ['session_id must be a string'] };
	if (body.wallet_address !== undefined && !isString(body.wallet_address)) return { valid: false, errors: ['wallet_address must be a string'] };
	if (body.provider !== undefined && !isString(body.provider)) return { valid: false, errors: ['provider must be a string'] };
	if (body.envelope_id !== undefined && !isString(body.envelope_id)) return { valid: false, errors: ['envelope_id must be a string'] };
	return {
		valid: true,
		value: {
			participant_id: isString(body.participant_id) ? body.participant_id.trim() : '',
			session_id: isString(body.session_id) ? body.session_id.trim() : undefined,
			wallet_address: isString(body.wallet_address) ? body.wallet_address.trim() : undefined,
			provider: isString(body.provider) ? body.provider.trim() : undefined,
			envelope_id: isString(body.envelope_id) ? body.envelope_id.trim() : undefined,
		},
	};
}

wealth.use('/*', async (c, next) => {
	const authHeader = c.req.header('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return c.json({ error: 'Missing or invalid authorization header' }, 401);
	}
	const token = authHeader.substring(7);
	const payload = await verifyToken(token, c.env.JWT_SECRET);
	if (!payload) return c.json({ error: 'Invalid or expired token' }, 401);
	c.set('userId', payload.sub);
	await next();
});

wealth.post('/deals', async (c) => {
	try {
		const userId = c.get('userId');
		const body = await c.req.json<unknown>();
		if (!isRecord(body)) return c.json({ error: 'Request body must be a JSON object' }, 400);
		const validation = validateCreateDealInput(body);
		if (!validation.valid) return c.json(validationErrorBody(validation.errors), 400);
		const createDealInput: CreateWealthDealRequest = {
			name: typeof body.name === 'string' ? body.name.trim() : '',
			property_address: typeof body.property_address === 'string' ? body.property_address.trim() : '',
			token_symbol: typeof body.token_symbol === 'string' ? body.token_symbol.trim() : '',
		};
		const dealId = generateId();
		const now = new Date().toISOString();
		const deal: WealthDeal = {
			id: dealId,
			name: createDealInput.name,
			property_address: createDealInput.property_address,
			token_symbol: createDealInput.token_symbol,
			owner_id: userId,
			signing_status: 'pending',
			mint_status: 'not_started',
			created_at: now,
			updated_at: now,
		};
		await c.env.DB.prepare(`INSERT INTO wealth_deals (id, name, property_address, token_symbol, owner_id, signing_status, mint_status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
			deal.id,
			deal.name,
			deal.property_address,
			deal.token_symbol,
			deal.owner_id,
			deal.signing_status,
			deal.mint_status,
			deal.created_at,
			deal.updated_at
		).run();
		await insertAuditEvent(c.env.DB, {
			dealId: deal.id,
			participantId: null,
			eventType: 'deal_created',
			payload: { name: deal.name, property_address: deal.property_address, token_symbol: deal.token_symbol, owner_id: deal.owner_id },
			createdAt: now,
		});
		return c.json(deal, 201);
	} catch {
		return c.json({ error: 'Internal server error' }, 500);
	}
});

wealth.get('/deals/:dealId', async (c) => {
	try {
		const dealId = c.req.param('dealId');
		const deal = await c.env.DB.prepare('SELECT * FROM wealth_deals WHERE id = ?').bind(dealId).first<WealthDeal>();
		if (!deal) return c.json({ error: 'Deal not found' }, 404);
		const participants = await c.env.DB.prepare('SELECT * FROM wealth_participants WHERE deal_id = ? ORDER BY created_at ASC').bind(dealId).all<WealthParticipant>();
		const signatures = await c.env.DB.prepare('SELECT * FROM wealth_signatures WHERE deal_id = ? ORDER BY completed_at ASC').bind(dealId).all<WealthSignatureRow>();
		const ownership = await c.env.DB.prepare('SELECT * FROM wealth_ownership_ledger WHERE deal_id = ? ORDER BY created_at ASC').bind(dealId).all<WealthOwnershipRow>();
		const auditEvents = await c.env.DB.prepare('SELECT * FROM wealth_audit_events WHERE deal_id = ? ORDER BY created_at ASC').bind(dealId).all<WealthAuditEvent>();
		return c.json({ ...deal, participants: participants.results || [], signatures: signatures.results || [], ownership: ownership.results || [], audit_events: auditEvents.results || [] });
	} catch {
		return c.json({ error: 'Internal server error' }, 500);
	}
});

wealth.post('/deals/:dealId/mint', async (c) => {
	try {
		const dealId = c.req.param('dealId');
		const body = await c.req.json<unknown>();
		const mintValidation = validateMintRequest(body);
		if (!mintValidation.valid) return c.json(validationErrorBody(mintValidation.errors), 400);
		const mintInput = mintValidation.value;
		const deal = await c.env.DB.prepare('SELECT signing_status FROM wealth_deals WHERE id = ?').bind(dealId).first<{ signing_status: 'pending' | 'completed' | 'rejected' }>();
		if (!deal) return c.json({ error: 'Deal not found' }, 404);
		const mintCheck = canMintOwnership({ signing_status: deal.signing_status });
		if (!mintCheck.allowed) return c.json({ error: mintCheck.reason }, 409);
		const participant = await c.env.DB.prepare('SELECT id FROM wealth_participants WHERE id = ? AND deal_id = ?').bind(mintInput.participant_id, dealId).first<{ id: string }>();
		if (!participant) return c.json({ error: 'Participant not found for deal' }, 404);
		const ledgerId = generateId();
		const createdAt = new Date().toISOString();
		let txHash: string | null = null;
		let status = 'pending';
		if (mintInput.on_chain === true) {
			const anchorPayload = JSON.stringify({ ledger_id: ledgerId, deal_id: dealId, participant_id: mintInput.participant_id, asset_id: mintInput.asset_id, amount: mintInput.amount, created_at: createdAt });
			const anchorPayloadHash = await sha256Hex(anchorPayload);
			const anchorResult = await anchorHash(c.env.ETH_PRIVATE_KEY, c.env.ETH_RPC_URL, anchorPayloadHash);
			if (anchorResult.success) {
				txHash = anchorResult.txHash ?? null;
				status = 'minted';
			} else {
				status = 'failed';
			}
		}
		const ledgerEntry: WealthOwnershipRow = { id: ledgerId, deal_id: dealId, participant_id: mintInput.participant_id, asset_id: mintInput.asset_id, amount: mintInput.amount, tx_hash: txHash, status, created_at: createdAt };
		await c.env.DB.prepare(`INSERT INTO wealth_ownership_ledger (id, deal_id, participant_id, asset_id, amount, tx_hash, status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
			ledgerEntry.id,
			ledgerEntry.deal_id,
			ledgerEntry.participant_id,
			ledgerEntry.asset_id,
			ledgerEntry.amount,
			ledgerEntry.tx_hash,
			ledgerEntry.status,
			ledgerEntry.created_at
		).run();
		await c.env.DB.prepare('UPDATE wealth_deals SET mint_status = ?, updated_at = ? WHERE id = ?').bind(ledgerEntry.status, createdAt, dealId).run();
		await insertAuditEvent(c.env.DB, {
			dealId,
			participantId: mintInput.participant_id,
			eventType: 'mint_recorded',
			payload: { asset_id: mintInput.asset_id, amount: mintInput.amount, on_chain: mintInput.on_chain === true, status: ledgerEntry.status, tx_hash: ledgerEntry.tx_hash },
			createdAt,
		});
		return c.json(ledgerEntry, mintInput.on_chain === true && ledgerEntry.status === 'failed' ? 502 : 200);
	} catch {
		return c.json({ error: 'Internal server error' }, 500);
	}
});

wealth.post('/deals/:dealId/participants', async (c) => {
	try {
		const dealId = c.req.param('dealId');
		const body = await c.req.json<unknown>();
		if (!isRecord(body)) return c.json({ error: 'Request body must be a JSON object' }, 400);
		const participantInput: Partial<Record<keyof AddWealthParticipantRequest, unknown>> = {
			display_name: body.display_name,
			email: body.email,
			wallet_address: body.wallet_address,
			role: body.role,
			share_pct: body.share_pct,
			cash_amount: body.cash_amount,
			loan_amount: body.loan_amount,
		};
		const validation = validateParticipantInput(participantInput);
		if (!validation.valid) return c.json(validationErrorBody(validation.errors), 400);
		const deal = await c.env.DB.prepare('SELECT id FROM wealth_deals WHERE id = ?').bind(dealId).first<{ id: string }>();
		if (!deal) return c.json({ error: 'Deal not found' }, 404);
		const participantId = generateId();
		const now = new Date().toISOString();
		const role: WealthParticipant['role'] = isWealthParticipantRole(participantInput.role) ? (participantInput.role as WealthParticipant['role']) : 'signer';
		const sharePct = typeof body.share_pct === 'number' ? body.share_pct : 0.0;
		const cashAmount = typeof body.cash_amount === 'string' ? body.cash_amount : '0';
		const loanAmount = typeof body.loan_amount === 'string' ? body.loan_amount : '0';

		const participant: WealthParticipant = {
			id: participantId,
			deal_id: dealId,
			display_name: typeof participantInput.display_name === 'string' ? participantInput.display_name.trim() : '',
			email: typeof participantInput.email === 'string' ? participantInput.email.trim() || null : null,
			wallet_address: typeof participantInput.wallet_address === 'string' ? participantInput.wallet_address.trim() || null : null,
			role,
			signing_status: 'pending',
			share_pct: sharePct,
			cash_amount: cashAmount,
			loan_amount: loanAmount,
			created_at: now,
		};
		await c.env.DB.prepare(`INSERT INTO wealth_participants (id, deal_id, display_name, email, wallet_address, role, signing_status, share_pct, cash_amount, loan_amount, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
			participant.id,
			participant.deal_id,
			participant.display_name,
			participant.email,
			participant.wallet_address,
			participant.role,
			participant.signing_status,
			participant.share_pct,
			participant.cash_amount,
			participant.loan_amount,
			participant.created_at
		).run();
		await insertAuditEvent(c.env.DB, {
			dealId,
			participantId: participant.id,
			eventType: 'participant_added',
			payload: {
				display_name: participant.display_name,
				email: participant.email,
				wallet_address: participant.wallet_address,
				role: participant.role,
				share_pct: participant.share_pct,
				cash_amount: participant.cash_amount,
				loan_amount: participant.loan_amount,
			},
			createdAt: now,
		});
		return c.json(participant, 201);
	} catch {
		return c.json({ error: 'Internal server error' }, 500);
	}
});

wealth.post('/deals/:dealId/signer-session', async (c) => {
	try {
		const dealId = c.req.param('dealId');
		const body = await c.req.json<unknown>();
		const validation = validateSessionRequest(body);
		if (!validation.valid) return c.json(validationErrorBody(validation.errors), 400);
		const participantInput = validation.value;
		const participant = await c.env.DB.prepare('SELECT id FROM wealth_participants WHERE id = ? AND deal_id = ?').bind(participantInput.participant_id, dealId).first<{ id: string }>();
		if (!participant) return c.json({ error: 'Participant not found for deal' }, 404);
		const createdAt = new Date().toISOString();
		const expiresAt = new Date(Date.now() + SIGNER_SESSION_TTL_SECONDS * 1000).toISOString();
		const session: WealthSignerSession = {
			session_id: generateId(),
			deal_id: dealId,
			participant_id: participantInput.participant_id,
			status: 'initiated',
			created_at: createdAt,
			expires_at: expiresAt,
		};
		await writeSignerSession(c.env.SESSION_KV, session);
		return c.json(session, 201);
	} catch {
		return c.json({ error: 'Internal server error' }, 500);
	}
});

wealth.post('/deals/:dealId/wallet-prep', async (c) => {
	try {
		const dealId = c.req.param('dealId');
		const body = await c.req.json<unknown>();
		const validation = validateSessionRequest(body);
		if (!validation.valid) return c.json(validationErrorBody(validation.errors), 400);
		const input = validation.value;
		if (!input.session_id) return c.json({ error: 'session_id is required' }, 400);
		if (!input.wallet_address) return c.json({ error: 'wallet_address is required' }, 400);
		const existingSession = await readSignerSession(c.env.SESSION_KV, input.session_id);
		if (!existingSession || existingSession.deal_id !== dealId || existingSession.participant_id !== input.participant_id) {
			return c.json({ error: 'Signer session not found' }, 404);
		}
		const updatedAt = new Date().toISOString();
		const session: WealthSignerSession = { ...existingSession, status: 'wallet_prepared', wallet_address: input.wallet_address, wallet_prepared_at: updatedAt };
		await writeSignerSession(c.env.SESSION_KV, session);
		await insertAuditEvent(c.env.DB, {
			dealId,
			participantId: input.participant_id,
			eventType: 'wallet_prepared',
			payload: { session_id: input.session_id, wallet_address: input.wallet_address },
			createdAt: updatedAt,
		});
		return c.json({ success: true, session_id: session.session_id, status: session.status }, 200);
	} catch {
		return c.json({ error: 'Internal server error' }, 500);
	}
});

wealth.post('/deals/:dealId/signing/start', async (c) => {
	try {
		const dealId = c.req.param('dealId');
		const body = await c.req.json<unknown>();
		const validation = validateSessionRequest(body);
		if (!validation.valid) return c.json(validationErrorBody(validation.errors), 400);
		const input = validation.value;
		if (!input.session_id) return c.json({ error: 'session_id is required' }, 400);
		const existingSession = await readSignerSession(c.env.SESSION_KV, input.session_id);
		if (!existingSession || existingSession.deal_id !== dealId || existingSession.participant_id !== input.participant_id) {
			return c.json({ error: 'Signer session not found' }, 404);
		}
		if (existingSession.status !== 'wallet_prepared') return c.json({ error: 'Wallet must be prepared before signing starts' }, 409);
		const startedAt = new Date().toISOString();
		const session: WealthSignerSession = {
			...existingSession,
			status: 'signing_started',
			provider: input.provider,
			envelope_id: input.envelope_id,
			signing_started_at: startedAt,
		};
		await writeSignerSession(c.env.SESSION_KV, session);
		await insertAuditEvent(c.env.DB, {
			dealId,
			participantId: input.participant_id,
			eventType: 'signing_started',
			payload: { session_id: session.session_id, provider: input.provider || null, envelope_id: input.envelope_id || null, wallet_address: session.wallet_address || null },
			createdAt: startedAt,
		});
		return c.json({ success: true, session_id: session.session_id, status: session.status }, 200);
	} catch {
		return c.json({ error: 'Internal server error' }, 500);
	}
});

wealth.post('/deals/:dealId/signing/complete', async (c) => {
	try {
		const dealId = c.req.param('dealId');
		const body = await c.req.json<unknown>();
		const signingValidation = validateSigningRequest(body);
		if (!signingValidation.valid) return c.json(validationErrorBody(signingValidation.errors), 400);
		const signingInput = signingValidation.value;
		const participant = await c.env.DB.prepare('SELECT id FROM wealth_participants WHERE id = ? AND deal_id = ?').bind(signingInput.participant_id, dealId).first<{ id: string }>();
		if (!participant) return c.json({ error: 'Participant not found for deal' }, 404);
		const signerSession = await readSignerSession(c.env.SESSION_KV, signingInput.session_id);
		if (!signerSession || signerSession.deal_id !== dealId || signerSession.participant_id !== signingInput.participant_id) {
			return c.json({ error: 'Signer session not found' }, 404);
		}
		if (signerSession.status !== 'signing_started') return c.json({ error: 'Signing has not been started for this session' }, 409);
		const signatureId = generateId();
		const now = new Date().toISOString();
		const storage = new StorageService(c.env);
		const evidencePayload = JSON.stringify({ signature_id: signatureId, deal_id: dealId, participant_id: signingInput.participant_id, document_name: signingInput.document_name, document_hash: signingInput.document_hash, provider: signingInput.provider, envelope_id: signingInput.envelope_id || null, completed_at: now });
		const evidenceKey = await storage.uploadTranscript(signatureId, evidencePayload);
		await c.env.DB.prepare(`INSERT INTO wealth_signatures (id, deal_id, participant_id, document_name, document_hash, provider, envelope_id, evidence_key, completed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
			signatureId,
			dealId,
			signingInput.participant_id,
			signingInput.document_name,
			signingInput.document_hash,
			signingInput.provider,
			signingInput.envelope_id || null,
			evidenceKey,
			now
		).run();
		await c.env.DB.prepare('UPDATE wealth_participants SET signing_status = ? WHERE id = ?').bind('completed', signingInput.participant_id).run();
		const participants = await c.env.DB.prepare('SELECT id, signing_status FROM wealth_participants WHERE deal_id = ?').bind(dealId).all<{ id: string; signing_status: WealthParticipant['signing_status'] }>();
		const allParticipantsCompleted = (participants.results || []).every((participantItem) => participantItem.signing_status === 'completed');
		await c.env.DB.prepare('UPDATE wealth_deals SET signing_status = ? WHERE id = ?').bind(allParticipantsCompleted ? 'completed' : 'pending', dealId).run();
		await writeSignerSession(c.env.SESSION_KV, { ...signerSession, status: 'completed', provider: signingInput.provider, envelope_id: signingInput.envelope_id, completed_at: now });
		await insertAuditEvent(c.env.DB, {
			dealId,
			participantId: signingInput.participant_id,
			eventType: 'signing_completed',
			payload: { session_id: signingInput.session_id, signature_id: signatureId, document_name: signingInput.document_name, document_hash: signingInput.document_hash, provider: signingInput.provider, envelope_id: signingInput.envelope_id || null, evidence_key: evidenceKey },
			createdAt: now,
		});
		return c.json({ success: true, message: 'Signing completed' }, 200);
	} catch {
		return c.json({ error: 'Internal server error' }, 500);
	}
});

export default wealth;
