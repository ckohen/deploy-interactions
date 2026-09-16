import { REST } from '@discordjs/rest';
import {
	type APIApplicationCommand,
	ApplicationCommandType,
	Routes,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	type RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody,
} from 'discord-api-types/v10';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { clear, deploy, type CommandMap } from '../src/lib/Deploy.js';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('deploy', () => {
	test.each([
		[true, 'Successfully bulk updated global commands.'],
		[false, 'Successfully bulk updated guild 345678901234567890 commands.'],
	])('identifies the destination in bulk overwrite logs', async (global, expectedLog) => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const command: RESTPostAPIChatInputApplicationCommandsJSONBody = {
			name: 'test',
			description: 'Test command',
			type: ApplicationCommandType.ChatInput,
		};
		const commands = new Map([
			[
				ApplicationCommandType.ChatInput,
				[
					{
						command,
						global,
						guildIds: global ? [] : ['345678901234567890'],
					},
				],
			],
		]) as CommandMap;

		await deploy({
			applicationId: '123456789012345678',
			bulkOverwrite: true,
			commands,
			dryRun: true,
			token: '',
		});

		expect(log).toHaveBeenCalledWith(expectedLog);
	});

	test('identifies the destination after a live bulk overwrite', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		vi.spyOn(REST.prototype, 'put').mockResolvedValue([]);
		const command: RESTPostAPIChatInputApplicationCommandsJSONBody = {
			name: 'test',
			description: 'Test command',
			type: ApplicationCommandType.ChatInput,
		};
		const commands = new Map([[ApplicationCommandType.ChatInput, [{ command, global: true }]]]) as CommandMap;

		await deploy({
			applicationId: '123456789012345678',
			bulkOverwrite: true,
			commands,
			token: 'token',
		});

		expect(log).toHaveBeenCalledWith('Successfully bulk updated global commands.');
	});

	test('includes primary entry point commands', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const command: RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody = {
			name: 'launch',
			description: 'Launch the activity',
			type: ApplicationCommandType.PrimaryEntryPoint,
		};
		const commands = new Map([
			[
				ApplicationCommandType.PrimaryEntryPoint,
				[
					{
						command,
						global: true,
					},
				],
			],
		]) as CommandMap;

		const result = await deploy({
			applicationId: '123456789012345678',
			commands,
			dryRun: true,
			token: '',
		});

		expect(result?.global?.skipped).toEqual([{ name: command.name, command }]);
	});

	test('rejects guild destinations for primary entry point commands', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const command: RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody = {
			name: 'launch',
			description: 'Launch the activity',
			type: ApplicationCommandType.PrimaryEntryPoint,
		};
		const commands = new Map([
			[
				ApplicationCommandType.PrimaryEntryPoint,
				[
					{
						command,
						global: false,
						guildIds: ['345678901234567890'],
					},
				],
			],
		]) as CommandMap;

		await expect(
			deploy({
				applicationId: '123456789012345678',
				commands,
				dryRun: true,
				token: '',
			}),
		).rejects.toThrow('cannot be deployed to a guild');
	});

	test('rejects primary entry point commands in guild-based developer mode', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const command: RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody = {
			name: 'launch',
			description: 'Launch the activity',
			type: ApplicationCommandType.PrimaryEntryPoint,
		};
		const commands = new Map([[ApplicationCommandType.PrimaryEntryPoint, [{ command, global: true }]]]) as CommandMap;

		await expect(
			deploy({
				applicationId: '123456789012345678',
				commands,
				devGuildId: '345678901234567890',
				dryRun: true,
				token: '',
			}),
		).rejects.toThrow('cannot be deployed in developer mode');
	});
});

describe('clear', () => {
	test('clears global and guild destinations in a dry run', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const guildId = '345678901234567890';

		const result = await clear({
			applicationId: '123456789012345678',
			destinations: ['global', guildId],
			dryRun: true,
			token: '',
		});

		expect(result.global).toEqual({ commands: [] });
		expect(result.guilds).toEqual(new Map([[guildId, { commands: [] }]]));
	});

	test('bulk overwrites global and guild commands with empty arrays', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const setToken = vi.spyOn(REST.prototype, 'setToken');
		const put = vi.spyOn(REST.prototype, 'put').mockResolvedValue([]);
		const applicationId = '123456789012345678';
		const guildId = '345678901234567890';

		const result = await clear({
			applicationId,
			destinations: ['global', guildId],
			token: 'token',
		});

		expect(setToken).toHaveBeenCalledWith('token');
		expect(put).toHaveBeenNthCalledWith(1, Routes.applicationCommands(applicationId), { body: [] });
		expect(put).toHaveBeenNthCalledWith(2, Routes.applicationGuildCommands(applicationId, guildId), { body: [] });
		expect(result).toEqual({ global: { commands: [] }, guilds: new Map([[guildId, { commands: [] }]]) });
	});

	test('returns and warns about commands Discord did not clear', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const returnedCommand = {
			type: ApplicationCommandType.ChatInput,
			name: 'test',
			id: '234567890123456789',
			version: '345678901234567890',
		} as APIApplicationCommand;
		vi.spyOn(REST.prototype, 'put').mockResolvedValue([returnedCommand]);

		const result = await clear({
			applicationId: '123456789012345678',
			destinations: ['global'],
			token: 'token',
		});

		expect(result.global).toEqual({ commands: [returnedCommand] });
		expect(log).toHaveBeenCalledWith('Warning cleared global commands, but 1 commands were returned from the API.');
	});

	test('returns a top-level error and stops after an authorization failure', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const error = Object.assign(new Error('Unauthorized'), { status: 401 });
		const put = vi.spyOn(REST.prototype, 'put').mockRejectedValue(error);

		const result = await clear({
			applicationId: '123456789012345678',
			destinations: ['global', '345678901234567890'],
			token: 'token',
		});

		expect(result).toEqual({ error, guilds: new Map() });
		expect(put).toHaveBeenCalledOnce();
	});

	test('records a global server error and continues clearing guilds', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const error = Object.assign(new Error('Server Error'), { status: 500 });
		vi.spyOn(REST.prototype, 'put').mockRejectedValueOnce(error).mockResolvedValueOnce([]);
		const guildId = '345678901234567890';

		const result = await clear({
			applicationId: '123456789012345678',
			destinations: ['global', guildId],
			token: 'token',
		});

		expect(result).toEqual({
			global: { bulkError: error, commands: [] },
			guilds: new Map([[guildId, { commands: [] }]]),
		});
	});

	test('records a guild error and continues clearing other guilds', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const error = Object.assign(new Error('Forbidden'), { status: 403 });
		vi.spyOn(REST.prototype, 'put').mockRejectedValueOnce(error).mockResolvedValueOnce([]);
		const firstGuild = '345678901234567890';
		const secondGuild = '456789012345678901';

		const result = await clear({
			applicationId: '123456789012345678',
			destinations: [firstGuild, secondGuild],
			token: 'token',
		});

		expect(result.guilds).toEqual(
			new Map([
				[firstGuild, { bulkError: error, commands: [] }],
				[secondGuild, { commands: [] }],
			]),
		);
	});

	test('stops clearing guilds after an authorization failure', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const error = Object.assign(new Error('Unauthorized'), { status: 401 });
		const put = vi.spyOn(REST.prototype, 'put').mockRejectedValue(error);

		const result = await clear({
			applicationId: '123456789012345678',
			destinations: ['345678901234567890', '456789012345678901'],
			token: 'token',
		});

		expect(result).toEqual({ error, guilds: new Map() });
		expect(put).toHaveBeenCalledOnce();
	});
});
