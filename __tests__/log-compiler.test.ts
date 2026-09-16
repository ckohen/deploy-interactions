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
	test('reports a partially successful deployment when one destination errors', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const results: DeployResponse = {
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
		};

		outputResults(results, false, false, false, true);

		expect(log).toHaveBeenCalledWith('Deploy Completed: Partially Successful');
	});
});
