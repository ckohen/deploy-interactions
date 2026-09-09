import {
	ApplicationCommandType,
	type RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody,
} from 'discord-api-types/v10';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { deploy, type CommandMap } from '../src/lib/Deploy.js';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('deploy', () => {
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
});
