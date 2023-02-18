import type { AddUndefinedToPossiblyUndefinedPropertiesOfInterface } from 'discord-api-types/utils/internals.js';
import {
	type APIApplicationCommand,
	type APIApplicationCommandOption,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	type RESTPostAPIApplicationCommandsJSONBody,
	type APIApplicationCommandSubcommandOption,
	type APIApplicationCommandChannelOption,
	type APIApplicationCommandStringOption,
	type APIApplicationCommandIntegerOption,
	type APIApplicationCommandNumberOption,
	type APIApplicationCommandOptionChoice,
} from 'discord-api-types/v10';
import { default as isEqual } from 'fast-deep-equal';

export type APIApplicationCommandChoicesOption =
	| APIApplicationCommandIntegerOption
	| APIApplicationCommandNumberOption
	| APIApplicationCommandStringOption;

export function isChoicesOption(
	option: AddUndefinedToPossiblyUndefinedPropertiesOfInterface<APIApplicationCommandOption>,
): option is APIApplicationCommandChoicesOption {
	return (
		option.type === ApplicationCommandOptionType.String ||
		option.type === ApplicationCommandOptionType.Integer ||
		option.type === ApplicationCommandOptionType.Number
	);
}

export function isSubcommandOption(
	option: AddUndefinedToPossiblyUndefinedPropertiesOfInterface<APIApplicationCommandOption>,
): option is APIApplicationCommandSubcommandOption {
	return (
		option.type === ApplicationCommandOptionType.SubcommandGroup ||
		option.type === ApplicationCommandOptionType.Subcommand
	);
}

export function isChannelOption(
	option: AddUndefinedToPossiblyUndefinedPropertiesOfInterface<APIApplicationCommandOption>,
): option is APIApplicationCommandChannelOption {
	return option.type === ApplicationCommandOptionType.Channel;
}

export function isNumericalOption(
	option: AddUndefinedToPossiblyUndefinedPropertiesOfInterface<APIApplicationCommandOption>,
): option is APIApplicationCommandIntegerOption | APIApplicationCommandNumberOption {
	return option.type === ApplicationCommandOptionType.Integer || option.type === ApplicationCommandOptionType.Number;
}

export function optionEquals(
	existing: APIApplicationCommandOption,
	option: AddUndefinedToPossiblyUndefinedPropertiesOfInterface<APIApplicationCommandOption>,
) {
	if (
		option.name !== existing.name ||
		option.type !== existing.type ||
		option.description !== existing.description ||
		(option.required ?? false) !== (existing.required ?? false) ||
		!isEqual(existing.name_localizations ?? {}, option.name_localizations ?? {}) ||
		!isEqual(existing.description_localizations ?? {}, option.description_localizations ?? {})
	) {
		return false;
	}

	if (isChoicesOption(existing) && isChoicesOption(option)) {
		if (existing.autocomplete !== option.autocomplete) return false;
		const existingChoices = (existing as APIApplicationCommandChoicesOption & { autocomplete?: false }).choices;
		const optionChoices = (option as APIApplicationCommandChoicesOption & { autocomplete?: false }).choices;
		if (existingChoices?.length !== optionChoices?.length) return false;
		if (existingChoices && optionChoices) {
			for (const choice of existingChoices) {
				const foundChoice = (optionChoices as APIApplicationCommandOptionChoice[]).find(
					(optChoice) => optChoice.name === choice.name,
				);
				if (!foundChoice || foundChoice.value !== choice.value) return false;
			}
		}
	}

	if (isSubcommandOption(existing) && isSubcommandOption(option)) {
		if (existing.options?.length !== option.options?.length) return false;
		if (existing.options && option.options) {
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			return optionsEqual(existing.options, option.options);
		}
	}

	if (isChannelOption(existing) && isChannelOption(option)) {
		if (existing.channel_types?.length !== option.channel_types?.length) return false;
		if (existing.channel_types && option.channel_types) {
			for (const type of existing.channel_types) {
				if (!option.channel_types.includes(type)) return false;
			}
		}
	}

	// eslint-disable-next-line sonarjs/prefer-single-boolean-return
	if (
		isNumericalOption(existing) &&
		isNumericalOption(option) &&
		(existing.min_value !== option.min_value || existing.max_value !== option.max_value)
	)
		return false;

	return true;
}

export function optionsEqual(
	existing: APIApplicationCommandOption[],
	options: AddUndefinedToPossiblyUndefinedPropertiesOfInterface<APIApplicationCommandOption>[],
) {
	if (existing.length !== options.length) return false;
	for (const option of existing) {
		const foundOption = options.find((opt) => opt.name === option.name);
		if (!foundOption || !optionEquals(option, foundOption)) return false;
	}

	return true;
}

export function commandEquals(existing: APIApplicationCommand, command: RESTPostAPIApplicationCommandsJSONBody) {
	if (
		command.name !== existing.name ||
		('description' in command && command.description !== existing.description) ||
		// Discord API defaults type to chat input
		(command.type ?? ApplicationCommandType.ChatInput) !== existing.type ||
		command.options?.length !== existing.options?.length ||
		command.default_member_permissions !== existing.default_member_permissions ||
		(existing.guild_id === undefined && (command.dm_permission ?? true) !== existing.dm_permission) ||
		!isEqual(existing.name_localizations ?? {}, command.name_localizations ?? {}) ||
		!isEqual(existing.description_localizations ?? {}, command.description_localizations ?? {})
	) {
		return false;
	}

	if (command.options && existing.options) {
		return optionsEqual(existing.options, command.options);
	}

	return true;
}
