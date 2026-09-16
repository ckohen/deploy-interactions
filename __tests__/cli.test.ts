import process from 'node:process';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as DeployModule from '../src/lib/Deploy.js';

const mocks = vi.hoisted(() => ({
	clear: vi.fn(),
	close: vi.fn(),
	getCommands: vi.fn(),
	getStoredConfig: vi.fn(),
	outputClearResults: vi.fn(),
	/* eslint-disable promise/prefer-await-to-callbacks, n/no-callback-literal -- readline uses a callback API */
	question: vi.fn((_query: string, _options: unknown, callback: (input: string) => void) => {
		callback('456789012345678901');
	}),
	/* eslint-enable promise/prefer-await-to-callbacks, n/no-callback-literal */
}));

vi.mock('node:readline', () => ({
	createInterface: () => ({ close: mocks.close, question: mocks.question }),
}));

vi.mock('../src/lib/Deploy.js', async (importOriginal) => ({
	...(await importOriginal<typeof DeployModule>()),
	clear: mocks.clear,
}));

vi.mock('../src/lib/FileParser.js', () => ({
	getCommands: mocks.getCommands,
	getStoredConfig: mocks.getStoredConfig,
	storeConfig: vi.fn(),
}));

vi.mock('../src/lib/LogCompiler.js', () => ({
	default: vi.fn(),
	outputClearResults: mocks.outputClearResults,
}));

const originalArgv = process.argv;

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	vi.spyOn(console, 'log').mockImplementation(() => undefined);
	mocks.clear.mockResolvedValue({ guilds: new Map() });
	mocks.getCommands.mockResolvedValue({});
});

afterEach(() => {
	process.argv = originalArgv;
	vi.restoreAllMocks();
});

describe('--clear', () => {
	test('clears explicit destinations without loading commands', async () => {
		process.argv = ['node', 'deploy-interactions', '--clear', 'global', '345678901234567890', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			token: 'token',
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());

		expect(mocks.clear).toHaveBeenCalledWith({
			applicationId: '123456789012345678',
			destinations: ['global', '345678901234567890'],
			dryRun: true,
			token: 'token',
		});
		expect(mocks.getCommands).not.toHaveBeenCalled();
		expect(mocks.outputClearResults).toHaveBeenCalledOnce();
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('all includes every discoverable and explicitly supplied destination', async () => {
		process.argv = ['node', 'deploy-interactions', '--clear', 'all', '567890123456789012', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commands: ['commands'],
			commandDestinations: {
				global: [],
				'345678901234567890': [],
			},
			developer: true,
			token: 'token',
		});
		mocks.getCommands.mockResolvedValue({
			finalCommands: [
				{
					command: { name: 'test', description: 'Test command', type: 1 },
					global: true,
					guildIds: ['234567890123456789'],
				},
			],
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());

		expect(mocks.clear).toHaveBeenCalledWith({
			applicationId: '123456789012345678',
			destinations: ['global', '234567890123456789', '345678901234567890', '456789012345678901', '567890123456789012'],
			dryRun: true,
			token: 'token',
		});
		expect(mocks.outputClearResults).toHaveBeenCalledOnce();
		expect(mocks.question).toHaveBeenCalledWith(
			'Developer Mode Enabled, please provide the guild id to use: ',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
			expect.any(Function),
		);
		expect(mocks.close).toHaveBeenCalledOnce();
	});
});
