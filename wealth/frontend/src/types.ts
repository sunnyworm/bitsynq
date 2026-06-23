export interface WealthDeal {
	id: string;
	name: string;
	property_address: string;
	token_symbol: string;
	owner_id: string;
	signing_status: string;
	mint_status: string;
	created_at: string;
	updated_at: string;
	participants?: WealthParticipant[];
	signatures?: WealthSignature[];
	ownership?: WealthOwnership[];
	audit_events?: WealthAuditEvent[];
}

export interface WealthParticipant {
	id: string;
	deal_id: string;
	display_name: string;
	email: string | null;
	wallet_address: string | null;
	role: string;
	signing_status: string;
	share_pct: number;
	cash_amount: string;
	loan_amount: string;
	created_at: string;
}

export interface WealthSignature {
	id: string;
	document_name: string;
	document_hash: string;
	provider: string;
	envelope_id?: string | null;
	evidence_key: string | null;
	completed_at: string;
}

export interface WealthOwnership {
	id: string;
	asset_id: number;
	amount: string;
	tx_hash: string | null;
	status: string;
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

export interface WealthSignerSession {
	session_id: string;
	deal_id: string;
	participant_id: string;
	status: string;
	created_at: string;
	expires_at: string;
}
