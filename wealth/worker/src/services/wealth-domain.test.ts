import { describe, expect, it } from 'vitest';
import { canMintOwnership, validateCreateDealInput, validateParticipantInput } from './wealth-domain';

describe('wealth domain', () => {
	it('accepts a valid create-deal payload', () => {
		expect(validateCreateDealInput({
			name: 'B3 Fractional Deal',
			property_address: 'Taipei City',
			token_symbol: 'WB3',
		})).toEqual({ valid: true, errors: [] });
	});

	it('rejects a create-deal with missing name', () => {
		expect(validateCreateDealInput({
			name: '',
			property_address: 'Taipei City',
			token_symbol: 'WB3',
		})).toEqual({ valid: false, errors: ['Deal name is required'] });
	});

	it('rejects a create-deal with invalid field types without coercion', () => {
		expect(validateCreateDealInput({ name: 123 as never, property_address: 'Taipei City', token_symbol: 'WB3' })).toEqual({ valid: false, errors: ['Deal name must be a string'] });
	});

	it('rejects a participant without wallet or email', () => {
		expect(validateParticipantInput({ display_name: 'Signer One' })).toEqual({ valid: false, errors: ['Participant email or wallet address is required'] });
	});

	it('rejects a participant with an empty or null role', () => {
		expect(validateParticipantInput({ display_name: 'Signer One', email: 'signer@example.com', role: '' as any })).toEqual({ valid: false, errors: ['Participant role must be owner, signer, or viewer'] });
		expect(validateParticipantInput({ display_name: 'Signer One', email: 'signer@example.com', role: null as any })).toEqual({ valid: false, errors: ['Participant role must be owner, signer, or viewer'] });
	});

	it('rejects a participant with a non-string role clearly', () => {
		expect(validateParticipantInput({ display_name: 'Signer One', email: 'signer@example.com', role: 42 as never })).toEqual({ valid: false, errors: ['Participant role must be owner, signer, or viewer'] });
	});

	it('accepts a participant with valid numeric share_pct', () => {
		expect(validateParticipantInput({
			display_name: 'Signer One',
			email: 'signer@example.com',
			share_pct: 12.5,
		})).toEqual({ valid: true, errors: [] });
	});

	it('rejects a participant with non-numeric share_pct', () => {
		expect(validateParticipantInput({
			display_name: 'Signer One',
			email: 'signer@example.com',
			share_pct: '12.5' as any,
		})).toEqual({ valid: false, errors: ['share_pct must be a number'] });
	});

	it('rejects a participant with non-string cash_amount', () => {
		expect(validateParticipantInput({
			display_name: 'Signer One',
			email: 'signer@example.com',
			cash_amount: 1000 as any,
		})).toEqual({ valid: false, errors: ['cash_amount must be a string'] });
	});

	it('rejects a participant with non-string loan_amount', () => {
		expect(validateParticipantInput({
			display_name: 'Signer One',
			email: 'signer@example.com',
			loan_amount: 500 as any,
		})).toEqual({ valid: false, errors: ['loan_amount must be a string'] });
	});

	it('blocks minting before signing is completed', () => {
		expect(canMintOwnership({ signing_status: 'pending' })).toEqual({ allowed: false, reason: 'Signing must be completed before minting ownership' });
	});
});
