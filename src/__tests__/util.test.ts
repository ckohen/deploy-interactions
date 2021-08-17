import {
	APIApplicationCommandArgumentOptions,
	RESTPostAPIChatInputApplicationCommandsJSONBody,
	RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from 'discord-api-types';
import { commandEquals, optionsEqual } from '../lib/util';

const receivedChatCommand = {
	id: '828935534738669580',
	application_id: '778562519022698507',
	name: 'test',
	description: 'various tests',
	version: '828935534738669581',
	default_permission: true,
	type: 1,
	guild_id: '788600861982588940',
	options: [
		{
			type: 1,
			name: 'argument',
			description: 'test with the string argument',
			options: [
				{ type: 3, name: 'string', description: 'the argument' },
				{ type: 4, name: 'int', description: 'the argument' },
				{ type: 5, name: 'bool', description: 'the argument' },
				{ type: 6, name: 'user', description: 'the argument' },
				{ type: 7, name: 'channel', description: 'the argument' },
				{ type: 8, name: 'role', description: 'the argument' },
				{ type: 9, name: 'mentionable', description: 'the argument' },
				{ type: 10, name: 'number', description: 'the argument' },
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
			type: 2,
			name: 'subcommand-group',
			description: 'test with subcommand group',
			options: [{ type: 1, name: 'subcommand', description: 'a subcommand' }],
		},
	],
};

const sentChatCommand: RESTPostAPIChatInputApplicationCommandsJSONBody = {
	name: receivedChatCommand.name,
	description: receivedChatCommand.description,
	type: receivedChatCommand.type,
	options: deepObjectArrayClone(receivedChatCommand.options),
	default_permission: receivedChatCommand.default_permission,
};

const receivedUserCommand = {
	id: '876998546929352734',
	application_id: '778562519022698507',
	name: 'test',
	description: '',
	version: '877002955285491742',
	default_permission: true,
	type: 2,
	guild_id: '788600861982588940',
};

const sentUserCommand: RESTPostAPIContextMenuApplicationCommandsJSONBody = {
	name: receivedUserCommand.name,
	type: receivedUserCommand.type,
	default_permission: receivedUserCommand.default_permission,
};

describe('Application Command Equality', () => {
	test('Top Level properties - Chat Commands', () => {
		expect(commandEquals(receivedChatCommand, sentChatCommand)).toBe(true);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, name: 'another-name' })).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, description: 'another description' })).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, type: 2 })).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, options: [] })).toBe(false);
		expect(commandEquals(receivedChatCommand, { ...sentChatCommand, default_permission: false })).toBe(false);

		let mutableSentCommand = { ...sentChatCommand };
		delete mutableSentCommand.options;
		expect(commandEquals(receivedChatCommand, mutableSentCommand)).toBe(false);
		mutableSentCommand = { ...sentChatCommand };
		delete mutableSentCommand.type;
		expect(commandEquals(receivedChatCommand, mutableSentCommand)).toBe(true);
		mutableSentCommand = { ...sentChatCommand };
		delete mutableSentCommand.default_permission;
		expect(commandEquals(receivedChatCommand, mutableSentCommand)).toBe(true);
	});
	test('Top Level properties - Content Menu Commands', () => {
		expect(commandEquals(receivedUserCommand, sentUserCommand)).toBe(true);
		// @ts-expect-error
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, description: '' })).toBe(true);
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, name: 'another-name' })).toBe(false);
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, type: 3 })).toBe(false);
		expect(commandEquals(receivedUserCommand, { ...sentUserCommand, default_permission: false })).toBe(false);
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
		options[2].type = 1; // Actually invalid
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);

		// Recursivity
		options = deepObjectArrayClone(receivedChatCommand.options);
		options[0].options[0].type = 4;
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
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
		(options[1].options[0] as APIApplicationCommandArgumentOptions).choices.shift();
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		(options[1].options[0] as APIApplicationCommandArgumentOptions).choices[0].name = 'another-name';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
		options = deepObjectArrayClone(receivedChatCommand.options);
		(options[1].options[0] as APIApplicationCommandArgumentOptions).choices[0].value = 'another value';
		expect(commandEquals(receivedChatCommand, { ...sentCommandNoOptions, options })).toBe(false);
	});
});

function deepObjectArrayClone(array: Array<any>) {
	return array.map((v) => {
		const cloned = { ...v };
		if (cloned.options) {
			cloned.options = deepObjectArrayClone(v.options);
		}
		if (cloned.choices) {
			cloned.choices = deepObjectArrayClone(v.choices);
		}
		return cloned;
	});
}
