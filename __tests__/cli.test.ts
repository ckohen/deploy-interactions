import process from 'node:process';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as DeployModule from '../src/lib/Deploy.js';

const mocks = vi.hoisted(() => {
	const answers: string[] = [];
	return {
		answers,
		clear: vi.fn(),
		close: vi.fn(),
		deploy: vi.fn(),
		getCommands: vi.fn(),
		getStoredConfig: vi.fn(),
		outputClearResults: vi.fn(),
		outputResults: vi.fn(),
		/* eslint-disable promise/prefer-await-to-callbacks -- readline uses a callback API */
		question: vi.fn((_query: string, _options: unknown, callback: (input: string) => void) => {
			callback(answers.shift() ?? '');
		}),
		/* eslint-enable promise/prefer-await-to-callbacks */
		storeConfig: vi.fn(),
	};
});

vi.mock('node:readline', () => ({
	createInterface: () => ({ close: mocks.close, question: mocks.question }),
}));

vi.mock('../src/lib/Deploy.js', async (importOriginal) => ({
	...(await importOriginal<typeof DeployModule>()),
	clear: mocks.clear,
	deploy: mocks.deploy,
}));

vi.mock('../src/lib/FileParser.js', () => ({
	getCommands: mocks.getCommands,
	getStoredConfig: mocks.getStoredConfig,
	storeConfig: mocks.storeConfig,
}));

vi.mock('../src/lib/LogCompiler.js', () => ({
	default: mocks.outputResults,
	outputClearResults: mocks.outputClearResults,
}));

const originalArgv = process.argv;

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.answers.splice(0);
	vi.spyOn(console, 'log').mockImplementation(() => undefined);
	mocks.clear.mockResolvedValue({ guilds: new Map() });
	mocks.deploy.mockResolvedValue({ guilds: new Map() });
	mocks.getCommands.mockResolvedValue({});
	mocks.storeConfig.mockResolvedValue(true);
});

afterEach(() => {
	process.argv = originalArgv;
	vi.restoreAllMocks();
});

describe('--clear', () => {
	test('clears explicit destinations without loading commands', async () => {
		const clearResult = { global: { commands: [] }, guilds: new Map() };
		mocks.clear.mockResolvedValue(clearResult);
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
		expect(mocks.outputClearResults).toHaveBeenCalledWith(clearResult, false, true, false, false);
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('all includes every discoverable and explicitly supplied destination', async () => {
		const clearResult = { guilds: new Map([['345678901234567890', { commands: [] }]]) };
		mocks.clear.mockResolvedValue(clearResult);
		mocks.answers.push('456789012345678901');
		process.argv = ['node', 'deploy-interactions', '--clear', 'all', '567890123456789012', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commands: ['commands'],
			commandDestinations: {
				global: [],
				'345678901234567890': [],
			},
			debug: true,
			developer: true,
			full: true,
			summary: false,
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
		expect(mocks.outputClearResults).toHaveBeenCalledWith(clearResult, true, true, true, true);
		expect(mocks.question).toHaveBeenCalledWith(
			'Developer Mode Enabled, please provide the guild id to use: ',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
			expect.any(Function),
		);
		expect(mocks.close).toHaveBeenCalledOnce();
	});
});

describe('deployment CLI', () => {
	test.each([
		['', '.interactionsrc.json'],
		['custom-interactions.json', 'custom-interactions.json'],
	])('offers to store first-run configuration as %s', async (filenameInput, expectedFilename) => {
		mocks.answers.push(
			'y',
			filenameInput,
			'123456789012345678',
			'a-valid-token-with-at-least-26-characters',
			'.',
			'y',
			'n',
		);
		process.argv = ['node', 'deploy-interactions'];
		mocks.getStoredConfig.mockResolvedValue(null);
		mocks.getCommands.mockResolvedValue({
			commands: [{ name: 'test', description: 'Test command' }],
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		expect(mocks.storeConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				clientId: '123456789012345678',
				token: 'a-valid-token-with-at-least-26-characters',
			}),
			expectedFilename,
		);
		expect(mocks.question).toHaveBeenCalledTimes(7);
	});

	test('groups stored command definitions by type and destination', async () => {
		const deployResult = { global: { commands: [], errored: [], skipped: [] }, guilds: new Map() };
		mocks.deploy.mockResolvedValue(deployResult);
		process.argv = ['node', 'deploy-interactions', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commandDefinitions: [
				{ name: 'chat', description: 'Chat command' },
				{ name: 'user', type: 2 },
			],
			commandDestinations: {
				global: [{ name: 'chat' }],
				'345678901234567890': [{ name: 'user', type: 2 }],
			},
			debug: true,
			full: true,
			summary: false,
			token: 'token',
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		const deployConfig = mocks.deploy.mock.calls[0]![0];
		expect(deployConfig).toMatchObject({
			applicationId: '123456789012345678',
			authoritative: false,
			bulkOverwrite: false,
			dryRun: true,
			force: false,
			token: 'token',
		});
		expect(deployConfig.commands.get(1)).toEqual([
			{
				command: { name: 'chat', description: 'Chat command' },
				global: true,
				guildIds: [],
			},
		]);
		expect(deployConfig.commands.get(2)).toEqual([
			{
				command: { name: 'user', type: 2 },
				global: false,
				guildIds: ['345678901234567890'],
			},
		]);
		expect(mocks.outputResults).toHaveBeenCalledWith(deployResult, true, true, true, true);
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('applies CLI overrides and stores the resulting configuration', async () => {
		const deployResult = { guilds: new Map() };
		mocks.deploy.mockResolvedValue(deployResult);
		process.argv = [
			'node',
			'deploy-interactions',
			'--client-id',
			'234567890123456789',
			'--token',
			'override-token',
			'--authoritative',
			'--bulk-overwrite',
			'--force',
			'--developer',
			'345678901234567890',
			'--dry-run',
			'--full',
			'--no-summary',
			'--store',
			'stored.json',
		];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commandDefinitions: [{ name: 'test', description: 'Test command' }],
			token: 'stored-token',
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		expect(mocks.storeConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				authoritative: true,
				bulkOverwrite: true,
				clientId: '234567890123456789',
				developer: true,
				devGuildId: '345678901234567890',
				dryRun: true,
				force: true,
				full: true,
				summary: false,
				token: 'override-token',
			}),
			'stored.json',
		);
		expect(mocks.deploy).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: '234567890123456789',
				authoritative: true,
				bulkOverwrite: true,
				devGuildId: '345678901234567890',
				dryRun: true,
				force: true,
				token: 'override-token',
			}),
		);
		expect(mocks.outputResults).toHaveBeenCalledWith(deployResult, false, true, true, true);
	});

	test('prompts for missing credentials', async () => {
		mocks.answers.push('short', '123456789012345678', 'short', 'a-valid-token-with-at-least-26-characters');
		process.argv = ['node', 'deploy-interactions', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			commandDefinitions: [{ name: 'test', description: 'Test command' }],
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		expect(mocks.deploy).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: '123456789012345678',
				token: 'a-valid-token-with-at-least-26-characters',
			}),
		);
		expect(mocks.question).toHaveBeenCalledTimes(4);
	});

	test('interactively configures a guild-only destination', async () => {
		mocks.answers.push('345678901234567890', 'unknown', 'test', 'n');
		process.argv = ['node', 'deploy-interactions', '--no-global', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commandDefinitions: [{ name: 'test', description: 'Test command' }],
			token: 'token',
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		const deployConfig = mocks.deploy.mock.calls[0]![0];
		expect(deployConfig.commands.get(1)).toEqual([
			{
				command: { name: 'test', description: 'Test command' },
				global: false,
				guildIds: ['345678901234567890'],
			},
		]);
		expect(mocks.question).toHaveBeenCalledTimes(4);
	});

	test('loads command files and interactively configures global and guild destinations', async () => {
		mocks.answers.push(
			'path-that-does-not-exist',
			'.',
			'n',
			'command',
			'y',
			'n',
			'test',
			'345678901234567890',
			'test',
			'n',
		);
		process.argv = ['node', 'deploy-interactions', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			token: 'token',
		});
		mocks.getCommands.mockResolvedValue({
			commands: [{ name: 'test', description: 'Test command' }],
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		expect(mocks.getCommands).toHaveBeenCalledWith(['.'], false, false, 'command');
		const deployConfig = mocks.deploy.mock.calls[0]![0];
		expect(deployConfig.commands.get(1)).toEqual([
			{
				command: { name: 'test', description: 'Test command' },
				global: true,
				guildIds: ['345678901234567890'],
			},
		]);
		expect(mocks.question).toHaveBeenCalledTimes(10);
	});

	test('configures all commands globally alongside a guild', async () => {
		mocks.answers.push('.', 'y', 'y', 'y', '345678901234567890', 'test', 'n');
		process.argv = ['node', 'deploy-interactions', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			token: 'token',
		});
		mocks.getCommands.mockResolvedValue({
			commands: [{ name: 'test', description: 'Test command' }],
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		const deployConfig = mocks.deploy.mock.calls[0]![0];
		expect(deployConfig.commands.get(1)).toEqual([
			{
				command: { name: 'test', description: 'Test command' },
				global: true,
				guildIds: ['345678901234567890'],
			},
		]);
	});

	test('disambiguates duplicate command names during destination setup', async () => {
		mocks.answers.push('345678901234567890', 'same', 'a', 'n');
		process.argv = ['node', 'deploy-interactions', '--no-global', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commandDefinitions: [
				{ name: 'same', description: 'Chat command' },
				{ name: 'same', type: 2 },
			],
			token: 'token',
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		const deployConfig = mocks.deploy.mock.calls[0]![0];
		expect(deployConfig.commands.get(1)?.[0]?.guildIds).toEqual(['345678901234567890']);
		expect(deployConfig.commands.get(2)?.[0]?.guildIds).toEqual(['345678901234567890']);
		expect(mocks.question).toHaveBeenCalledTimes(4);
	});

	test('selects one command type after retrying invalid disambiguation input', async () => {
		mocks.answers.push('345678901234567890', 'same', 'invalid', 'u', 'n');
		process.argv = ['node', 'deploy-interactions', '--no-global', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commandDefinitions: [
				{ name: 'same', description: 'Chat command' },
				{ name: 'same', type: 2 },
			],
			token: 'token',
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		const deployConfig = mocks.deploy.mock.calls[0]![0];
		expect(deployConfig.commands.get(1)?.[0]?.guildIds).toEqual([]);
		expect(deployConfig.commands.get(2)?.[0]?.guildIds).toEqual(['345678901234567890']);
		expect(mocks.question).toHaveBeenCalledTimes(5);
	});

	test('deploys command files with path-level destinations', async () => {
		process.argv = ['node', 'deploy-interactions', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commands: ['commands'],
			token: 'token',
		});
		const configuredCommand = {
			command: { name: 'test', description: 'Test command' },
			global: true,
			guildIds: ['345678901234567890'],
		};
		mocks.getCommands.mockResolvedValue({ finalCommands: [configuredCommand] });

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		const deployConfig = mocks.deploy.mock.calls[0]![0];
		expect(deployConfig.commands.get(1)).toEqual([configuredCommand]);
	});

	test('configures destinations when path-level commands have none', async () => {
		mocks.answers.push('345678901234567890', 'test', 'n');
		process.argv = ['node', 'deploy-interactions', '--no-global', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commands: ['commands'],
			token: 'token',
		});
		mocks.getCommands.mockResolvedValue({
			finalCommands: [
				{
					command: { name: 'test', description: 'Test command' },
					global: false,
					guildIds: [],
				},
			],
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		const deployConfig = mocks.deploy.mock.calls[0]![0];
		expect(deployConfig.commands.get(1)?.[0]).toMatchObject({
			global: false,
			guildIds: ['345678901234567890'],
		});
	});

	test('excludes primary entry point commands from guild selection', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		mocks.answers.push('345678901234567890', 'n');
		process.argv = ['node', 'deploy-interactions', '--no-global', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commandDefinitions: [{ name: 'launch', description: 'Launch activity', type: 4 }],
			token: 'token',
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		expect(log).toHaveBeenCalledWith('No commands can be deployed to this guild.');
		const deployConfig = mocks.deploy.mock.calls[0]![0];
		expect(deployConfig.commands.get(4)?.[0]?.guildIds).toEqual([]);
	});

	test('closes and exits when stored configuration cannot be loaded', async () => {
		const exit = vi.spyOn(process, 'exit').mockImplementation((code): never => {
			throw new Error(`exit ${String(code)}`);
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		process.argv = ['node', 'deploy-interactions'];
		mocks.getStoredConfig.mockRejectedValue(new Error('Invalid config'));

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

		expect(mocks.close).toHaveBeenCalledOnce();
		expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'exit 1' }));
	});

	test('closes and exits when command loading fails', async () => {
		const exit = vi.spyOn(process, 'exit').mockImplementation((code): never => {
			throw new Error(`exit ${String(code)}`);
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		process.argv = ['node', 'deploy-interactions'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commands: ['commands'],
			token: 'token',
		});
		mocks.getCommands.mockResolvedValue({ error: true });

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

		expect(mocks.close).toHaveBeenCalledOnce();
		expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'exit 1' }));
	});

	test('reports when deployment has no results', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		mocks.deploy.mockResolvedValue(null);
		process.argv = ['node', 'deploy-interactions', '--dry-run'];
		mocks.getStoredConfig.mockResolvedValue({
			clientId: '123456789012345678',
			commandDefinitions: [{ name: 'test', description: 'Test command' }],
			token: 'token',
		});

		await import('../src/bin/deploy-interactions.js');
		await vi.waitFor(() => expect(mocks.deploy).toHaveBeenCalledOnce());

		expect(log).toHaveBeenCalledWith('No commands found to deploy!');
		expect(mocks.outputResults).not.toHaveBeenCalled();
	});
});
