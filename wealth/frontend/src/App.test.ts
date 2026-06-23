import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';

const { api } = vi.hoisted(() => ({
	api: {
		createDeal: vi.fn(),
		addParticipant: vi.fn(),
		createSignerSession: vi.fn(),
		prepareWallet: vi.fn(),
		startSigning: vi.fn(),
		completeSigning: vi.fn(),
		mintOwnership: vi.fn(),
		getDeal: vi.fn(),
	},
}));

vi.mock('./api', () => ({ api }));

const loadedDeal = {
	id: 'deal-1',
	name: 'B3 Fractional Deal',
	property_address: 'Taipei City',
	token_symbol: 'WB3',
	owner_id: 'user-1',
	signing_status: 'completed',
	mint_status: 'minted',
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-02T00:00:00.000Z',
	participants: [
		{
			id: 'participant-1',
			deal_id: 'deal-1',
			display_name: 'Signer One',
			email: 'signer@example.com',
			wallet_address: '0xabc123',
			role: 'signer',
			signing_status: 'completed',
			created_at: '2026-01-01T00:00:00.000Z',
		},
	],
	signatures: [
		{
			id: 'signature-1',
			document_name: 'Purchase Agreement',
			document_hash: 'sha256-abc123',
			provider: 'sandbox-esign',
			envelope_id: 'env-1',
			evidence_key: 'wealth:signature:1',
			completed_at: '2026-01-02T00:00:00.000Z',
		},
	],
	ownership: [
		{
			id: 'ledger-1',
			asset_id: 77,
			amount: '1.5',
			status: 'minted',
			tx_hash: '0xtx-123',
			created_at: '2026-01-03T00:00:00.000Z',
		},
	],
	audit_events: [
		{
			id: 'audit-1',
			deal_id: 'deal-1',
			participant_id: 'participant-1',
			event_type: 'signing_completed',
			payload_json: '{"provider":"sandbox-esign"}',
			created_at: '2026-01-02T00:00:00.000Z',
		},
	],
};

describe('Wealth App', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		api.getDeal.mockResolvedValue(loadedDeal);
		api.createSignerSession.mockResolvedValue({
			session_id: 'session-1',
			deal_id: 'deal-1',
			participant_id: 'participant-1',
			status: 'initiated',
			created_at: '2026-01-01T00:00:00.000Z',
			expires_at: '2026-01-02T00:00:00.000Z',
		});
		api.prepareWallet.mockResolvedValue({ success: true, session_id: 'session-1', status: 'wallet_prepared' });
		api.startSigning.mockResolvedValue({ success: true, session_id: 'session-1', status: 'signing_started' });
		api.completeSigning.mockResolvedValue({ success: true });
	});

	it('renders signer flow and history sections', async () => {
		const wrapper = mount(App);

		await wrapper.get('input[placeholder="Deal ID"]').setValue('deal-1');
		await wrapper.get('button[data-test="refresh-deal"]').trigger('click');
		await flushPromises();

		expect(wrapper.text()).toContain('Signer flow');
		expect(wrapper.text()).toContain('Signature history');
		expect(wrapper.text()).toContain('Audit history');
		expect(wrapper.text()).toContain('Purchase Agreement');
		expect(wrapper.text()).toContain('signing_completed');
		expect(wrapper.text()).toContain('View on Sepolia');
	});

	it('runs the signer session, wallet prep, and signing start flow', async () => {
		const wrapper = mount(App);

		await wrapper.get('input[placeholder="Deal ID"]').setValue('deal-1');
		await wrapper.get('button[data-test="refresh-deal"]').trigger('click');
		await flushPromises();

		await wrapper.get('input[placeholder="Signer participant ID"]').setValue('participant-1');
		await wrapper.get('form[data-test="start-session-form"]').trigger('submit');
		await flushPromises();

		expect(api.createSignerSession).toHaveBeenCalledWith('deal-1', { participant_id: 'participant-1' });

		await wrapper.get('input[placeholder="Signer wallet address"]').setValue('0xabc123');
		await wrapper.get('form[data-test="wallet-prep-form"]').trigger('submit');
		await flushPromises();

		expect(api.prepareWallet).toHaveBeenCalledWith('deal-1', {
			participant_id: 'participant-1',
			session_id: 'session-1',
			wallet_address: '0xabc123',
		});

		await wrapper.get('button[data-test="signing-start"]').trigger('click');
		await flushPromises();

		expect(api.startSigning).toHaveBeenCalledWith('deal-1', {
			participant_id: 'participant-1',
			session_id: 'session-1',
			provider: 'sandbox-esign',
			envelope_id: 'env-demo',
		});
	});

	it('loads B3 template successfully', async () => {
		api.createDeal.mockResolvedValue({ id: 'deal-1', name: '宜蘭建蘭北路 B3 標的' });
		api.addParticipant.mockResolvedValue({ id: 'participant-1' });

		const wrapper = mount(App);
		await wrapper.get('button[data-test="load-b3-template"]').trigger('click');
		await flushPromises();

		expect(api.createDeal).toHaveBeenCalledWith({
			name: '宜蘭建蘭北路 B3 標的',
			property_address: '宜蘭縣宜蘭市建蘭北路315之2號',
			token_symbol: 'YILAN-B3',
		});
		expect(api.addParticipant).toHaveBeenCalledTimes(4);
		expect(api.addParticipant).toHaveBeenNthCalledWith(1, 'deal-1', {
			display_name: '周文海 (甲方)',
			role: 'signer',
			share_pct: 0.0833,
			cash_amount: '1,000,000',
			loan_amount: '2,554,167',
			email: 'zhou@wealth.local',
		});
		expect(wrapper.text()).toContain('宜蘭建蘭北路 B3 標的 presets loaded successfully.');
	});

	it('loads B5 template successfully', async () => {
		api.createDeal.mockResolvedValue({ id: 'deal-2', name: '宜蘭建業段 B5 標的' });
		api.addParticipant.mockResolvedValue({ id: 'participant-2' });

		const wrapper = mount(App);
		await wrapper.get('button[data-test="load-b5-template"]').trigger('click');
		await flushPromises();

		expect(api.createDeal).toHaveBeenCalledWith({
			name: '宜蘭建業段 B5 標的',
			property_address: '宜蘭縣宜蘭市建業段00837-000地號',
			token_symbol: 'YILAN-B5',
		});
		expect(api.addParticipant).toHaveBeenCalledTimes(7);
		expect(api.addParticipant).toHaveBeenNthCalledWith(1, 'deal-2', {
			display_name: '吳萬益 (甲方)',
			role: 'signer',
			share_pct: 0.1666,
			cash_amount: '3,000,000',
			loan_amount: '4,831,400',
			email: 'wu-wan@wealth.local',
		});
		expect(wrapper.text()).toContain('宜蘭建業段 B5 標的 presets loaded successfully.');
	});
});

