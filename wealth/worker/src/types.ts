export interface Env {
	DB: D1Database;
	SESSION_KV: KVNamespace;
	EVIDENCE_KV: KVNamespace;
	JWT_SECRET: string;
	CORS_ORIGIN: string;
	DEMO_USER_ID?: string;
	ETH_RPC_URL: string;
	ETH_PRIVATE_KEY: string;
}

export interface JWTPayload {
	sub: string;
	email: string;
	exp: number;
	iat: number;
}

export interface WealthDeal {
	id: string;
	name: string;
	property_address: string;
	token_symbol: string;
	owner_id: string;
	signing_status: 'pending' | 'completed' | 'rejected';
	mint_status: 'not_started' | 'pending' | 'minted' | 'failed';
	created_at: string;
	updated_at: string;
}

export interface WealthParticipant {
	id: string;
	deal_id: string;
	display_name: string;
	email: string | null;
	wallet_address: string | null;
	role: 'owner' | 'signer' | 'viewer';
	signing_status: 'pending' | 'completed' | 'rejected';
	share_pct: number;
	cash_amount: string;
	loan_amount: string;
	created_at: string;
}

export interface WealthAuditEvent {
	id: string;
	deal_id: string;
	participant_id: string | null;
	event_type: string;
	payload_json: string;
	created_at: string;
}

export type SignerSessionStatus = 'initiated' | 'wallet_prepared' | 'signing_started' | 'completed';

export interface WealthSignerSession {
	session_id: string;
	deal_id: string;
	participant_id: string;
	status: SignerSessionStatus;
	provider?: string;
	envelope_id?: string;
	wallet_address?: string;
	created_at: string;
	expires_at: string;
	wallet_prepared_at?: string;
	signing_started_at?: string;
	completed_at?: string;
}

export interface CreateWealthDealRequest {
	name: string;
	property_address: string;
	token_symbol: string;
}

export interface AddWealthParticipantRequest {
	display_name: string;
	email?: string;
	wallet_address?: string;
	role?: 'owner' | 'signer' | 'viewer';
	share_pct?: number;
	cash_amount?: string;
	loan_amount?: string;
}

export interface CompleteWealthSigningRequest {
	participant_id: string;
	session_id: string;
	document_name: string;
	document_hash: string;
	provider: string;
	envelope_id?: string;
}

export interface MintWealthOwnershipRequest {
	participant_id: string;
	amount: string;
	asset_id: number;
	on_chain?: boolean;
}
