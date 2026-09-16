import type { DiscordAPIError } from '@discordjs/rest';
import { ApplicationCommandType, type APIApplicationCommand } from 'discord-api-types/v10';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ClearResponse, DeployResponse } from '../src/lib/Deploy.js';
import outputResults, { outputClearResults } from '../src/lib/LogCompiler.js';

const failed = new Error('Failed') as DiscordAPIError;
const returnedCommand = {
	type: ApplicationCommandType.ChatInput,
	name: 'test',
	id: '123456789012345678',
	version: '234567890123456789',
} as APIApplicationCommand;

afterEach(() => {
	vi.restoreAllMocks();
});

describe('outputClearResults', () => {
	test.each([
		['Successful', { global: { commands: [] }, guilds: new Map() }],
		[
			'Partially Successful',
			{
				global: { commands: [] },
				guilds: new Map([['345678901234567890', { bulkError: failed, commands: [] }]]),
			},
		],
		[
			'Failed',
			{
				guilds: new Map([['345678901234567890', { bulkError: failed, commands: [] }]]),
			},
		],
		[
			'Partially Successful',
			{
				global: { commands: [] },
				guilds: new Map([['345678901234567890', { commands: [returnedCommand] }]]),
			},
		],
		['Failed', { global: { commands: [returnedCommand] }, guilds: new Map() }],
	] satisfies [string, ClearResponse][])('reports a %s clear', (expected, results) => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputClearResults(results, false, false, false, true);

		expect(log).toHaveBeenCalledWith(`Clear Completed: ${expected}`);
	});

	test('reports an operation-level error', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputClearResults({ error: failed, guilds: new Map() }, false, false, false, false);

		expect(log).toHaveBeenCalledWith('Clear Failed:', failed.message);
	});

	test('includes the full error when debugging', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputClearResults({ error: failed, guilds: new Map() }, true, false, false, false);

		expect(log).toHaveBeenCalledWith('Clear Failed:', failed);
	});

	test('reports when there are no destinations to clear', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputClearResults({ guilds: new Map() }, false, false, false, false);

		expect(log).toHaveBeenCalledWith('No Commands Cleared');
	});

	test('outputs successful dry-run destinations without an empty table', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputClearResults(
			{ global: { commands: [] }, guilds: new Map([['345678901234567890', { commands: [] }]]) },
			false,
			true,
			false,
			false,
		);

		expect(log).toHaveBeenCalledWith('Clear of global successful');
		expect(log).toHaveBeenCalledWith('Clear of 345678901234567890 successful');
	});

	test('outputs a successful full result without creating an empty table', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputClearResults({ global: { commands: [] }, guilds: new Map() }, false, false, true, false);

		expect(log).toHaveBeenCalledWith('Clear of global successful');
	});

	test('outputs detailed errors and commands returned by Discord', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputClearResults(
			{
				global: { commands: [returnedCommand] },
				guilds: new Map([['345678901234567890', { bulkError: failed, commands: [] }]]),
			},
			false,
			false,
			true,
			false,
		);

		expect(log).toHaveBeenCalledWith(expect.stringContaining('Not Cleared (API Returned)'));
		expect(log).toHaveBeenCalledWith('Clear of 345678901234567890 failed: Failed');
	});

	test('outputs a summary table for global and guild destinations', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputClearResults(
			{
				global: { commands: [] },
				guilds: new Map([['345678901234567890', { bulkError: failed, commands: [] }]]),
			},
			false,
			false,
			false,
			false,
		);

		expect(log).toHaveBeenCalledWith(expect.stringContaining('Summary'));
		expect(log).toHaveBeenCalledWith(expect.stringContaining('Guild (345678901234567890)'));
	});
});

describe('outputResults', () => {
	test.each([
		['Successful', { global: { commands: [returnedCommand], errored: [], skipped: [] }, guilds: new Map() }],
		[
			'Partially Successful',
			{
				global: { commands: [returnedCommand], errored: [], skipped: [] },
				guilds: new Map([
					[
						'345678901234567890',
						{
							commands: [],
							errored: [
								{
									command: { name: 'test', description: 'Test command' },
									error: failed,
									name: 'test',
								},
							],
							skipped: [],
						},
					],
				]),
			},
		],
		[
			'Failed',
			{
				guilds: new Map([
					[
						'345678901234567890',
						{
							commands: [],
							errored: [
								{
									command: { name: 'test', description: 'Test command' },
									error: failed,
									name: 'test',
								},
							],
							skipped: [],
						},
					],
				]),
			},
		],
	] satisfies [string, DeployResponse][])('reports a %s deployment', (expected, results) => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputResults(results, false, false, false, true);

		expect(log).toHaveBeenCalledWith(`Deploy Completed: ${expected}`);
	});

	test.each([
		[false, failed.message],
		[true, failed],
	])('reports an operation-level deployment error (debug: %s)', (debug, expected) => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputResults({ error: failed, guilds: new Map() }, debug, false, false, false);

		expect(log).toHaveBeenCalledWith('Deployment Failed:', expected);
	});

	test('reports when there are no deployed destinations', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputResults({ guilds: new Map() }, false, false, false, false);

		expect(log).toHaveBeenCalledWith('No Commmands Deployed');
	});

	test('outputs developer dry runs in full', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const guildId = '345678901234567890';

		outputResults(
			{
				dev: guildId,
				guilds: new Map([
					[
						guildId,
						{
							commands: [],
							errored: [],
							skipped: [
								{
									command: { name: 'test', description: 'Test command' },
									name: 'test',
								},
							],
						},
					],
				]),
			},
			false,
			true,
			false,
			false,
		);

		expect(log).toHaveBeenCalledWith(expect.stringContaining('Skipped (Dry Run)'));
	});

	test('outputs successful, skipped, and errored commands in full', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const skippedCommand = { name: 'skipped', description: 'Skipped command' };
		const existing = { ...returnedCommand, name: 'skipped' } as APIApplicationCommand;

		outputResults(
			{
				global: {
					commands: [returnedCommand],
					errored: [
						{
							command: { name: 'errored', description: 'Errored command' },
							error: failed,
							name: 'errored',
						},
					],
					skipped: [{ command: skippedCommand, existing, id: existing.id, name: existing.name }],
				},
				guilds: new Map(),
			},
			false,
			false,
			true,
			false,
		);

		expect(log).toHaveBeenCalledWith(expect.stringContaining('Success'));
		expect(log).toHaveBeenCalledWith(expect.stringContaining('Skipped (Matched Existing)'));
		expect(log).toHaveBeenCalledWith(expect.stringContaining('Failed (Failed)'));
	});

	test('outputs a full bulk deployment error', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputResults(
			{
				global: { bulkError: failed, commands: [], errored: [], skipped: [] },
				guilds: new Map(),
			},
			false,
			false,
			true,
			false,
		);

		expect(log).toHaveBeenCalledWith('Deploy to global failed: Failed');
	});

	test('outputs full results for a guild destination', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputResults(
			{
				guilds: new Map([['345678901234567890', { commands: [returnedCommand], errored: [], skipped: [] }]]),
			},
			false,
			false,
			true,
			false,
		);

		expect(log).toHaveBeenCalledWith(expect.stringContaining('Deploy to 345678901234567890 successful'));
	});

	test('outputs a deployment summary table for global and guild destinations', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		outputResults(
			{
				global: { commands: [returnedCommand], errored: [], skipped: [] },
				guilds: new Map([['345678901234567890', { bulkError: failed, commands: [], errored: [], skipped: [] }]]),
			},
			false,
			false,
			false,
			false,
		);

		expect(log).toHaveBeenCalledWith(expect.stringContaining('Summary'));
		expect(log).toHaveBeenCalledWith(expect.stringContaining('Guild (345678901234567890)'));
		expect(log).toHaveBeenCalledWith(expect.stringContaining('All (Failed)'));
	});
});
