import axios, { type AxiosInstance } from 'axios';
import type { WealthDeal, WealthSignerSession } from './types';

class WealthApi {
	private client: AxiosInstance;
	private token: string | null = null;

	constructor() {
		this.client = axios.create({
			baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
			headers: { 'Content-Type': 'application/json' },
		});
	}

	async ensureToken() {
		if (this.token) return;
		const response = await this.client.post<{ token: string }>('/demo/token');
		this.token = response.data.token;
		this.client.defaults.headers.common.Authorization = `Bearer ${this.token}`;
	}

	async createDeal(payload: { name: string; property_address: string; token_symbol: string }) {
		await this.ensureToken();
		const response = await this.client.post<WealthDeal>('/wealth/deals', payload);
		return response.data;
	}

	async addParticipant(dealId: string, payload: { display_name: string; email?: string; role?: string; share_pct?: number; cash_amount?: string; loan_amount?: string }) {
		await this.ensureToken();
		const response = await this.client.post(`/wealth/deals/${dealId}/participants`, {
			...payload,
			role: payload.role ?? 'signer',
		});
		return response.data;
	}

	async createSignerSession(dealId: string, payload: { participant_id: string }) {
		await this.ensureToken();
		const response = await this.client.post<WealthSignerSession>(`/wealth/deals/${dealId}/signer-session`, payload);
		return response.data;
	}

	async prepareWallet(dealId: string, payload: { participant_id: string; session_id: string; wallet_address: string }) {
		await this.ensureToken();
		const response = await this.client.post(`/wealth/deals/${dealId}/wallet-prep`, payload);
		return response.data;
	}

	async startSigning(dealId: string, payload: { participant_id: string; session_id: string; provider?: string; envelope_id?: string }) {
		await this.ensureToken();
		const response = await this.client.post(`/wealth/deals/${dealId}/signing/start`, payload);
		return response.data;
	}

	async completeSigning(dealId: string, payload: { participant_id: string; session_id: string; document_name: string; document_hash: string; provider: string; envelope_id?: string }) {
		await this.ensureToken();
		const response = await this.client.post(`/wealth/deals/${dealId}/signing/complete`, payload);
		return response.data;
	}

	async mintOwnership(dealId: string, payload: { participant_id: string; amount: string; asset_id: number; on_chain?: boolean }) {
		await this.ensureToken();
		const response = await this.client.post(`/wealth/deals/${dealId}/mint`, payload);
		return response.data;
	}

	async getDeal(dealId: string) {
		await this.ensureToken();
		const response = await this.client.get<WealthDeal>(`/wealth/deals/${dealId}`);
		return response.data;
	}
}

export const api = new WealthApi();
