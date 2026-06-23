import type { AddWealthParticipantRequest, CreateWealthDealRequest } from '../types';

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

const wealthParticipantRoles = ['owner', 'signer', 'viewer'] as const;

function validateRequiredStringField(value: unknown, requiredMessage: string, typeMessage: string): string | null {
	if (typeof value !== 'string') return typeMessage;
	if (!value.trim()) return requiredMessage;
	return null;
}

export function isWealthParticipantRole(value: unknown): value is AddWealthParticipantRequest['role'] {
	return typeof value === 'string' && wealthParticipantRoles.includes(value as (typeof wealthParticipantRoles)[number]);
}

export function validateCreateDealInput(input: Partial<Record<keyof CreateWealthDealRequest, unknown>>): ValidationResult {
	const errors: string[] = [];
	const nameError = validateRequiredStringField(input.name, 'Deal name is required', 'Deal name must be a string');
	const propertyAddressError = validateRequiredStringField(input.property_address, 'Property address is required', 'Property address must be a string');
	const tokenSymbolError = validateRequiredStringField(input.token_symbol, 'Token symbol is required', 'Token symbol must be a string');
	if (nameError) errors.push(nameError);
	if (propertyAddressError) errors.push(propertyAddressError);
	if (tokenSymbolError) errors.push(tokenSymbolError);
	return { valid: errors.length === 0, errors };
}

export function validateParticipantInput(input: Partial<Record<keyof AddWealthParticipantRequest, unknown>>): ValidationResult {
	const errors: string[] = [];
	const trimmedDisplayName = typeof input.display_name === 'string' ? input.display_name.trim() : '';
	const trimmedEmail = typeof input.email === 'string' ? input.email.trim() : '';
	const trimmedWallet = typeof input.wallet_address === 'string' ? input.wallet_address.trim() : '';
	const hasRoleField = Object.prototype.hasOwnProperty.call(input, 'role');
	if (!trimmedDisplayName) errors.push('Participant display name is required');
	if (!trimmedEmail && !trimmedWallet) errors.push('Participant email or wallet address is required');
	if (hasRoleField && !isWealthParticipantRole(input.role)) errors.push('Participant role must be owner, signer, or viewer');

	// Validation for numeric share_pct if provided
	if (input.share_pct !== undefined && typeof input.share_pct !== 'number') {
		errors.push('share_pct must be a number');
	}
	return { valid: errors.length === 0, errors };
}

export function canMintOwnership(input: { signing_status: 'pending' | 'completed' | 'rejected' }): { allowed: boolean; reason?: string } {
	if (input.signing_status !== 'completed') {
		return { allowed: false, reason: 'Signing must be completed before minting ownership' };
	}
	return { allowed: true };
}
