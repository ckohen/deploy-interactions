import type {
	APIApplicationCommand,
	APIApplicationCommandChannelOption,
	APIApplicationCommandIntegerOption,
	APIApplicationCommandStringOption,
	RESTPostAPIChatInputApplicationCommandsJSONBody,
	RESTPostAPIContextMenuApplicationCommandsJSONBody,
	RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody,
} from 'discord-api-types/v10';
import {
	ApplicationCommandOptionType,
	ApplicationCommandType,
	ApplicationIntegrationType,
	EntryPointCommandHandlerType,
	InteractionContextType,
} from 'discord-api-types/v10';
import { describe, test, expect } from 'vitest';
import { type APIApplicationCommandChoicesOption, commandEquals, optionsEqual } from '../src/lib/Util.js';

const receivedChatCommand = {
	id: '828935534738669580',
	application_id: '778562519022698507',
	name: 'test',
	description: 'various tests',
	version: '828935534738669581',
	default_member_permissions: '0',
	dm_permission: true,
	type: 1,
	options: [
		{
			type: 1,
			name: 'argument',
			description: 'test with the string argument',
			options: [
				{ type: 3, name: 'string', description: 'the argument' },
				{ type: 4, name: 'int', description: 'the argument' },
				{ type: 4, name: 'int-min-max', description: 'the argument', min_value: 0, max_value: 100 },
				{ type: 5, name: 'bool', description: 'the argument' },
				{ type: 6, name: 'user', description: 'the argument' },
				{ type: 7, name: 'channel', description: 'the argument' },
				{ type: 8, name: 'role', description: 'the argument' },
				{ type: 9, name: 'mentionable', description: 'the argument' },
				{ type: 10, name: 'number', description: 'the argument' },
				{ type: 11, name: 'attachment', description: 'the argument' },
			],
		},
		{
			type: 1,
			name: 'choices',
			description: 'test with string or int choices',
			options: [
				{
					type: 3,
					name: 'string',
					description: 'the string choices',
					choices: [
						{ name: 'filled', value: 'filled' },
						{ name: 'empty', value: '' },
					],
				},
				{
					type: 4,
					name: 'int',
					description: 'the integer choices',
					choices: [
						{ name: '1', value: 1 },
						{ name: '0', value: 0 },
					],
				},
			],
		},
		{
			type: 1,
			name: 'autocomplete',
			description: 'test with string or int autocomplete',
			options: [
				{
					type: 3,
					name: 'string',
					description: 'the string choices',
					autcomplete: true,
				},
				{
					type: 4,
					name: 'int',
					description: 'the integer choices',
					autcomplete: true,
				},
			],
		},
		{
			type: 1,
			name: 'channel-types',
			description: 'test with channel types',
			options: [{ type: 7, name: 'channel', description: 'the channel options', channel_types: [0, 2] }],
		},
		{
			type: 2,
			name: 'subcommand-group',
			description: 'test with subcommand group',
			options: [{ type: 1, name: 'subcommand', description: 'a subcommand' }],
		},
	],
};

function deepObjectArrayClone<
	T extends (typeof receivedChatCommand)['options'] | (typeof receivedChatCommand)['options'][0]['options'],
>(array: T) {
	return array.map((value) => {
		const cloned = { ...value };
		if (cloned.options) {
			cloned.options = deepObjectArrayClone(value.options);
		}

		if (cloned.choices) {
			cloned.choices = deepObjectArrayClone(value.choices);
		}

		if (cloned.channel_types) {
			cloned.channel_types = [...(value.channel_types as number[])];
		}

		return cloned;
	});
}

const sentChatCommand: RESTPostAPIChatInputApplicationCommandsJSONBody = {
	name: receivedChatCommand.name,
	description: receivedChatCommand.description,
	type: receivedChatCommand.type,
	options: deepObjectArrayClone(receivedChatCommand.options),
	default_member_permissions: receivedChatCommand.default_member_permissions,
	dm_permission: receivedChatCommand.dm_permission,
};

const receivedUserCommand = {
	id: '876998546929352734',
	application_id: '778562519022698507',
	name: 'test',
	description: '',
	version: '877002955285491742',
	default_member_permissions: '0',
	dm_permission: true,
	type: 2,
};

const sentUserCommand: RESTPostAPIContextMenuApplicationCommandsJSONBody = {
	name: receivedUserCommand.name,
	type: receivedUserCommand.type,
	default_member_permissions: receivedUserCommand.default_member_permissions,
	dm_permission: receivedUserCommand.dm_permission,
};

describe('Application Command Equality', () => {
	test('Top Level properties - Chat Commands', () => {
		expect(commandEquals(receivedChatCommand, sentChatCommand)).toBe(true);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, name: 'another-name' })).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, description: 'another description' })).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, type: 2 })).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, options: [] })).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, default_member_permissions: '8' })).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, dm_permission: false })).toBe(false);

		let mutableSentCommand = { ...sentChatCommand };
		delete mutableSentCommand.options;
		expect(commandEquals(receivedChatCommand, mutableSentCommand)).toBe(false);
		mutableSentCommand = { ...sentChatCommand };
		delete mutableSentCommand.type;
		expect(commandEquals(receivedChatCommand, mutableSentCommand)).toBe(true);
		mutableSentCommand = { ...sentChatCommand };
		delete mutableSentCommand.dm_permission;
		expect(commandEquals(receivedChatCommand, mutableSentCommand)).toBe(true);
	});
	test('Top Level properties - Content Menu Commands', () => {
		expect(commandEquals(receivedUserCommand, sentUserCommand)).toBe(true);
		// @ts-expect-error testing random properties
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, description: '' })).toBe(true);
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, name: 'another-name' })).toBe(false);
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, type: 3 })).toBe(false);
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, default_member_permissions: '8' })).toBe(false);
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, dm_permission: false })).toBe(false);
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, options: [] })).toBe(false);
	});
	test('Options properties', () => {
		const sentCommandNoOptions = { ...sentChatCommand };
		delete sentCommandNoOptions.options;
		let options = deepObjectArrayClone(receivedChatCommand.options);
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(true);
		options[0].name = 'another-name';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[0].description = 'another description';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[0].type = 2; // Actually invalid
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[1].name = 'another-name';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[1].description = 'another description';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[1].type = 2; // Actually invalid
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[2].name = 'another-name';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[2].description = 'another description';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[2].type = 2; // Actually invalid
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[3].name = 'another-name';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[3].description = 'another description';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[3].type = 2; // Actually invalid
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[4].name = 'another-name';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[4].description = 'another description';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[4].type = 1; // Actually invalid
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);

		// Recursivity
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[0].options[0].type = 4;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);

		// Autocomplete
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[2].options[0].autocomplete = false;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(true);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[2].options[1].autocomplete = false;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(true);
	});
	test('Options lengths', () => {
		const sentCommandNoOptions = { ...sentChatCommand };
		delete sentCommandNoOptions.options;
		let options = deepObjectArrayClone(receivedChatCommand.options);
		expect(optionsEqual(receivedChatCommand.options, options)).toBe(true);
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(true);
		options.shift();
		expect(optionsEqual(receivedChatCommand.options, options)).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[0].options.shift();
		expect(optionsEqual(receivedChatCommand.options, options)).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
	});
	test('Choices', () => {
		const sentCommandNoOptions = { ...sentChatCommand };
		delete sentCommandNoOptions.options;
		let options = deepObjectArrayClone(receivedChatCommand.options);
		(options[1].options[0] as APIApplicationCommandChoicesOption & { autocomplete: false }).choices!.shift();
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		(options[1].options[0] as APIApplicationCommandChoicesOption & { autocomplete: false }).choices![0].name =
			'another-name';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		(options[1].options[0] as APIApplicationCommandChoicesOption & { autocomplete: false }).choices![0].value =
			'another value';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
	});
	test('Channel Types', () => {
		const sentCommandNoOptions = { ...sentChatCommand };
		delete sentCommandNoOptions.options;
		let options = deepObjectArrayClone(receivedChatCommand.options);
		(options[3].options[0] as APIApplicationCommandChannelOption).channel_types!.shift();
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		(options[3].options[0] as APIApplicationCommandChannelOption).channel_types![0] = 1;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		(options[3].options[0] as APIApplicationCommandChannelOption).channel_types![0] = 2;
		(options[3].options[0] as APIApplicationCommandChannelOption).channel_types![1] = 0;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(true);
	});
	test('Min Max Value', () => {
		const sentCommandNoOptions = { ...sentChatCommand };
		delete sentCommandNoOptions.options;
		let options = deepObjectArrayClone(receivedChatCommand.options);
		(options[0].options[2] as APIApplicationCommandIntegerOption).min_value = 1;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		delete (options[0].options[2] as APIApplicationCommandIntegerOption).min_value;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		(options[0].options[2] as APIApplicationCommandIntegerOption).max_value = 1;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		delete (options[0].options[2] as APIApplicationCommandIntegerOption).max_value;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
	});
});

describe('Current application command properties', () => {
	const existingCommand: APIApplicationCommand = {
		id: '123456789012345678',
		application_id: '234567890123456789',
		name: 'modern',
		description: 'A modern command',
		type: ApplicationCommandType.ChatInput,
		version: '345678901234567890',
		default_member_permissions: null,
		default_permission: true,
		dm_permission: false,
		nsfw: true,
		integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
		contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
		options: [
			{
				type: ApplicationCommandOptionType.String,
				name: 'query',
				description: 'Search query',
				required: true,
				autocomplete: false,
				min_length: 2,
				max_length: 100,
				choices: [
					{ name: 'First', name_localizations: { 'es-ES': 'Primero' }, value: 'first' },
					{ name: 'Second', value: 'second' },
				],
			},
			{
				type: ApplicationCommandOptionType.Boolean,
				name: 'private',
				description: 'Only show the result to you',
			},
		],
	};

	const command: RESTPostAPIChatInputApplicationCommandsJSONBody = {
		name: existingCommand.name,
		description: existingCommand.description,
		type: ApplicationCommandType.ChatInput,
		nsfw: true,
		integration_types: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall],
		contexts: [InteractionContextType.BotDM, InteractionContextType.Guild],
		options: structuredClone(existingCommand.options),
	};

	test('normalizes defaults and unordered command contexts', () => {
		expect(commandEquals(existingCommand, command)).toBe(true);
		expect(commandEquals(existingCommand, { ...command, default_member_permissions: '0' })).toBe(false);
		expect(commandEquals(existingCommand, { ...command, default_permission: false })).toBe(false);
		expect(commandEquals(existingCommand, { ...command, nsfw: false })).toBe(false);
		expect(commandEquals(existingCommand, { ...command, contexts: [InteractionContextType.Guild] })).toBe(false);
		expect(
			commandEquals(existingCommand, {
				...command,
				integration_types: [ApplicationIntegrationType.GuildInstall],
			}),
		).toBe(false);
	});

	test('uses contexts instead of deprecated DM permissions when provided', () => {
		expect(commandEquals(existingCommand, { ...command, dm_permission: true })).toBe(true);

		const commandWithoutContexts = { ...command, contexts: undefined };
		expect(commandEquals(existingCommand, { ...commandWithoutContexts, dm_permission: false })).toBe(true);
		expect(commandEquals(existingCommand, { ...commandWithoutContexts, dm_permission: true })).toBe(false);
	});

	test('compares string length constraints and choice localizations', () => {
		const options = structuredClone(command.options!);
		(options[0] as APIApplicationCommandStringOption).min_length = 3;
		expect(commandEquals(existingCommand, { ...command, options })).toBe(false);

		(options[0] as APIApplicationCommandStringOption).min_length = 2;
		(options[0] as APIApplicationCommandStringOption).max_length = 101;
		expect(commandEquals(existingCommand, { ...command, options })).toBe(false);

		(options[0] as APIApplicationCommandStringOption).max_length = 100;
		(options[0] as APIApplicationCommandStringOption & { autocomplete: false }).choices![0]!.name_localizations = {
			'es-ES': 'Uno',
		};
		expect(commandEquals(existingCommand, { ...command, options })).toBe(false);
	});

	test('compares display order for options and choices', () => {
		const reorderedOptions = structuredClone(command.options!).reverse();
		expect(commandEquals(existingCommand, { ...command, options: reorderedOptions })).toBe(false);

		const reorderedChoices = structuredClone(command.options!);
		(reorderedChoices[0] as APIApplicationCommandStringOption & { autocomplete: false }).choices!.reverse();
		expect(commandEquals(existingCommand, { ...command, options: reorderedChoices })).toBe(false);
	});

	test('compares primary entry point handlers', () => {
		const existingEntryPoint: APIApplicationCommand = {
			id: '456789012345678901',
			application_id: existingCommand.application_id,
			name: 'launch',
			description: 'Launch the activity',
			type: ApplicationCommandType.PrimaryEntryPoint,
			version: '567890123456789012',
			default_member_permissions: null,
			handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
		};
		const entryPoint: RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody = {
			name: existingEntryPoint.name,
			description: existingEntryPoint.description,
			type: ApplicationCommandType.PrimaryEntryPoint,
			handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
		};

		expect(commandEquals(existingEntryPoint, entryPoint)).toBe(true);
		expect(commandEquals(existingEntryPoint, { ...entryPoint, handler: EntryPointCommandHandlerType.AppHandler })).toBe(
			false,
		);
	});
});
