import {
	APIApplicationCommand,
	APIApplicationCommandOption,
	APIApplicationCommandArgumentOptions,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	RESTPostAPIApplicationCommandsJSONBody,
	APIApplicationCommandSubCommandOptions,
} from 'discord-api-types/v9';

export function commandEquals(existing: APIApplicationCommand, command: RESTPostAPIApplicationCommandsJSONBody) {
	if (
		command.name !== existing.name ||
		('description' in command && command.description !== existing.description) ||
		// Discord API defaults type to chat input
		(command.type ?? ApplicationCommandType.ChatInput) !== existing.type ||
		command.options?.length !== existing.options?.length ||
		// Discord API defaults this to true
		(command.default_permission ?? true) !== existing.default_permission
	) {
		return false;
	}

	if (command.options && existing.options) {
		return optionsEqual(existing.options, command.options);
	}
	return true;
}

export function optionsEqual(existing: APIApplicationCommandOption[], options: APIApplicationCommandOption[]) {
	if (existing.length !== options.length) return false;
	for (const option of existing) {
		const foundOption = options.find((o) => o.name === option.name);
		if (!foundOption || !optionEquals(option, foundOption)) return false;
	}
	return true;
}

export function optionEquals(existing: APIApplicationCommandOption, option: APIApplicationCommandOption) {
	if (
		option.name !== existing.name ||
		option.type !== existing.type ||
		option.description !== existing.description ||
		(option.required ?? false) !== (existing.required ?? false)
	) {
		return false;
	}
	if (isArgumentoption(existing) && isArgumentoption(option)) {
		if (existing.choices?.length !== option.choices?.length) return false;
		if (existing.choices && option.choices) {
			for (const choice of existing.choices) {
				const foundChoice = option.choices.find((c) => c.name === choice.name);
				if (!foundChoice || foundChoice.value !== choice.value) return false;
			}
		}
	}

	if (isSubcommandOption(existing) && isSubcommandOption(option)) {
		if (existing.options?.length !== option.options?.length) return false;
		if (existing.options && option.options) {
			return optionsEqual(existing.options, option.options);
		}
	}
	return true;
}

export function isArgumentoption(option: APIApplicationCommandOption): option is APIApplicationCommandArgumentOptions {
	return (
		option.type === ApplicationCommandOptionType.String ||
		option.type === ApplicationCommandOptionType.Integer ||
		option.type === ApplicationCommandOptionType.Number
	);
}

export function isSubcommandOption(
	option: APIApplicationCommandOption,
): option is APIApplicationCommandSubCommandOptions {
	return (
		option.type === ApplicationCommandOptionType.SubcommandGroup ||
		option.type === ApplicationCommandOptionType.Subcommand
	);
}
