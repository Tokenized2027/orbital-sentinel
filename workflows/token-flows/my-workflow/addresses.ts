/**
 * SDL Token Flow Tracker — address registry.
 *
 * Groups mirror intelligence/config.py classifications.
 * Update both files when adding/removing tracked addresses.
 */

export type AddressEntry = {
	address: string;
	label: string;
	group: 'nop' | 'nop_sub' | 'protocol' | 'whale' | 'dex' | 'defi' | 'vesting' | 'sniper';
	trackStLink?: boolean;
};

export type VestingEntry = {
	address: string;
	beneficiary: string;
	label: string;
};

// ── SDL token + stLINK contracts ────────────────────────────────────────────
export const SDL_TOKEN = '0xA95C5ebB86E0dE73B4fB8c47A45B792CFeA28C23';
export const STLINK_TOKEN = '0xb8b295df2cd735b15BE5Eb419517Aa626fc43cD5';

// ── NOP primary wallets ─────────────────────────────────────────────────────
export const NOP_ADDRESSES: AddressEntry[] = [
	{ address: '0xf2ad781cff42e1f506b78553da89090c65b1a847', label: 'Stakin', group: 'nop' },
	{ address: '0x26119f458dd1e8780554e3e517557b9d290fb4dd', label: '01NODE', group: 'nop' },
	{ address: '0x20c0b7b370c97ed139aea464205c05fceaf4ac68', label: 'Chainlayer', group: 'nop' },
	{ address: '0x06c28eed84e9114502d545fc5316f24daa385c75', label: 'CryptoManufaktur', group: 'nop' },
	{ address: '0x6ef38c3d1d85b710a9e160ad41b912cb8cac2589', label: 'Framework', group: 'nop' },
	{ address: '0xc316276f87019e5adbc3185a03e23abf948a732d', label: 'LinkForest.io', group: 'nop' },
	{ address: '0x6879826450e576b401c4ddeff2b7755b1e85d97c', label: 'LinkPool', group: 'nop' },
	{ address: '0x4dc81f63cb356c1420d4620414f366794072a3a8', label: 'Matrixed.Link', group: 'nop' },
	{ address: '0xcef3da64348483c65dec9cb1f59ddf46b0149755', label: 'Pier Two', group: 'nop' },
	{ address: '0x3f44c324bd76e031171d6f2b87c4fef00d4294c2', label: 'Simply Staking', group: 'nop' },
	{ address: '0xfae26207ab74ee528214ee92f94427f8cdbb6a32', label: 'Tiingo', group: 'nop' },
	{ address: '0xe2b7cba5e48445f9bd17193a29d7fdeb4effb078', label: 'inotel', group: 'nop' },
	{ address: '0xd79576f14b711406a4d4489584121629329dfa2c', label: 'stakefish', group: 'nop' },
	{ address: '0x479f6833bc5456b00276473db1bd3ee93ff8e3e2', label: 'LinkRiver', group: 'nop' },
	{ address: '0xa0181758b14efb2dadfec66d58251ae631e2b942', label: 'Orion Staking', group: 'nop' },
];

// ── NOP sub-wallets ─────────────────────────────────────────────────────────
export const NOP_SUB_WALLETS: AddressEntry[] = [
	{ address: '0xb351ec0feaf4b99fdfd36b484d9ec90d0422493d', label: 'SDL Vesting Contract', group: 'nop_sub' },
	{ address: '0x95c94e386fe93768bbb2eac696b07e6c37b1a811', label: 'Matrixed.Link sub-wallet', group: 'nop_sub' },
	{ address: '0x60a619ea9e867f284c5c0a7c495e62c0d55152fc', label: 'LinkPool sub-wallet #1', group: 'nop_sub' },
	{ address: '0x20cf96b69c750ecf4da1f68b8bda9b1d6614ef56', label: 'LinkPool sub-wallet #2', group: 'nop_sub' },
	{ address: '0x23d544ad20218a45006a4e27a3af96efdcca2f68', label: 'LinkPool sub-wallet #3', group: 'nop_sub' },
	{ address: '0xdc02299028442693f902b807eee6d4019a4b1188', label: 'LinkPool sub-wallet #4', group: 'nop_sub' },
	{ address: '0x86a9cacaa7b13d3109628cde14ed0dc6adc89f0b', label: 'LinkPool sub-wallet #5', group: 'nop_sub' },
	{ address: '0x3a4c68d1325f8bfe9ec0dfca5cd3721bf4ac7012', label: 'LinkPool sub-wallet #6', group: 'nop_sub' },
	{ address: '0x3ae9009fd7bf66cdeec91e886a49563b5dd783fe', label: 'LinkPool sub-wallet #7', group: 'nop_sub' },
	{ address: '0x246d89cf65007206fd5cef0562ee3a62568acbc2', label: 'LinkPool seller #1', group: 'nop_sub' },
	{ address: '0xd9f8906a05b6da6b9416db992d3a2f262c9a93e8', label: 'LinkPool seller #2', group: 'nop_sub' },
	{ address: '0x9f9def476c382f0515b6fcd0a798b7955edb518f', label: 'LinkPool seller #3', group: 'nop_sub' },
	{ address: '0x4c99c98c43c0dcb68b38ffd986bbf22b8844a329', label: 'LinkPool seller #4', group: 'nop_sub' },
	{ address: '0x8e8cffc902000f96f66a8a58b989b08281e78b13', label: 'LinkPool seller #5', group: 'nop_sub' },
	{ address: '0x91b69286a903599e787590812c4f2026c53f0273', label: 'LinkPool seller #6', group: 'nop_sub' },
	{ address: '0x476cbe2ffd47cda6184071ec040a0b35766d8b67', label: 'LinkPool seller #7', group: 'nop_sub' },
	{ address: '0x71b30ec586a1225374f1680dbed38aa666a46d6f', label: 'Chainlayer sub-wallet', group: 'nop_sub' },
	{ address: '0xae559b5835c4f79f6bddb64b04a7f651725a097d', label: 'LinkForest.io relay', group: 'nop_sub' },
	{ address: '0x73a4be3547643be8d294d214ab181635504d8d53', label: 'LinkForest.io selling', group: 'nop_sub' },
];

// ── Protocol addresses ──────────────────────────────────────────────────────
export const PROTOCOL_ADDRESSES: AddressEntry[] = [
	{ address: '0x25d0d4c5caa077e64d4829197e6ce1ac9ff237aa', label: 'Fireblocks Custody', group: 'protocol', trackStLink: true },
	{ address: '0x23c4602e63acfe29b930c530b19d44a84af0d767', label: 'SDL Ops (fee collector)', group: 'protocol' },
	{ address: '0xf460234aa383dc0c5e6c7e0f4f8e63d2a36e2e8e', label: 'Fireblocks Relay', group: 'protocol' },
	{ address: '0xdeda4c43136d4f40f75073b0d815c648330fd072', label: 'Chainlink Labs (7.69M SDL)', group: 'protocol' },
	{ address: '0x0B2eF910ad0b34bf575Eb09d37fd7DA6c148CA4d', label: 'reSDL Pool', group: 'protocol', trackStLink: true },
];

// ── Whale addresses ─────────────────────────────────────────────────────────
export const WHALE_ADDRESSES: AddressEntry[] = [
	{ address: '0x381b278bbd1a39623ce45b28dd0bc9bb977172a8', label: 'LinkPool OG #130', group: 'whale' },
	{ address: '0x48d74d69a293c32b9fec25be57eb4dd01e060430', label: 'mayorstinky.eth', group: 'whale' },
	{ address: '0xa37d1bfc67f20ac3d88a3d50e2d315a95161d89c', label: 'Unknown whale (710K reSDL)', group: 'whale' },
];

// ── DEX pairs ───────────────────────────────────────────────────────────────
export const DEX_ADDRESSES: AddressEntry[] = [
	{ address: '0x51d1026e35d0f9aa0ff243ebc84bb923852c1fc3', label: 'Uniswap V3 LINK/SDL', group: 'dex' },
	{ address: '0xd27b7d42d24d8f7c1cf5c46ccd3b986c396fde17', label: 'SushiSwap LINK/SDL', group: 'dex' },
];

// ── Known snipers (from analytics/lib/config/known-snipers.json) ────────────
export const SNIPER_ADDRESSES: AddressEntry[] = [
	{ address: '0x6394fa063e74884304ecafb4588fe09091793c09', label: 'Safe #1 (Kraken-funded)', group: 'sniper' },
	{ address: '0x4a470942dd7a44c6574666f8bda47ce33c19a601', label: 'Oldwhite (0x4a4)', group: 'sniper' },
];

// ── Vesting contracts ───────────────────────────────────────────────────────
// SDLVesting.sol instances — beneficiary is checked for releasableAmount()
export const VESTING_CONTRACTS: VestingEntry[] = [
	{
		address: '0xb351ec0feaf4b99fdfd36b484d9ec90d0422493d',
		beneficiary: '0xb351ec0feaf4b99fdfd36b484d9ec90d0422493d',
		label: 'SDL Vesting (6-of-8 Safe)',
	},
];

// ── All tracked addresses ───────────────────────────────────────────────────
export function getAllAddresses(): AddressEntry[] {
	return [
		...NOP_ADDRESSES,
		...NOP_SUB_WALLETS,
		...PROTOCOL_ADDRESSES,
		...WHALE_ADDRESSES,
		...DEX_ADDRESSES,
		...SNIPER_ADDRESSES,
	];
}

// Addresses that also get stLINK balance checked
export function getStLinkTrackedAddresses(): AddressEntry[] {
	return getAllAddresses().filter(
		(a) => a.trackStLink || a.group === 'nop' || a.group === 'protocol',
	);
}
