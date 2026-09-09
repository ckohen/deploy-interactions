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
import isEqual from 'fast-deep-equal';

type AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Base> = {
	[Key in keyof Base]: Base[Key] extends Exclude<Base[Key], undefined>
		? AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Base[Key]>
		: AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Base[Key]> | undefined;
};

export type APIApplicationCommandChoicesOption =
	APIApplicationCommandIntegerOption | APIApplicationCommandNumberOption | APIApplicationCommandStringOption;

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

export function isStringOption(
	option: AddUndefinedToPossiblyUndefinedPropertiesOfInterface<APIApplicationCommandOption>,
): option is APIApplicationCommandStringOption {
	return option.type === ApplicationCommandOptionType.String;
}

function unorderedNumberArraysEqual(
	left: readonly number[] | null | undefined,
	right: readonly number[] | null | undefined,
): boolean {
	if (left?.length !== right?.length) return false;
	if (!left || !right) return true;

	const sortedLeft = [...left].sort((first, second) => first - second);
	const sortedRight = [...right].sort((first, second) => first - second);
	return sortedLeft.every((value, index) => value === sortedRight[index]);
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
		if ((existing.autocomplete ?? false) !== (option.autocomplete ?? false)) return false;
		const existingChoices = (existing as APIApplicationCommandChoicesOption & { autocomplete?: false }).choices;
		const optionChoices = (option as APIApplicationCommandChoicesOption & { autocomplete?: false }).choices;
		if ((existingChoices?.length ?? 0) !== (optionChoices?.length ?? 0)) return false;
		if (existingChoices && optionChoices) {
			for (const [index, choice] of existingChoices.entries()) {
				const optionChoice = (optionChoices as APIApplicationCommandOptionChoice[])[index];
				if (
					optionChoice?.name !== choice.name ||
					optionChoice?.value !== choice.value ||
					!isEqual(optionChoice?.name_localizations ?? {}, choice.name_localizations ?? {})
				) {
					return false;
				}
			}
		}
	}

	if (isSubcommandOption(existing) && isSubcommandOption(option)) {
		if ((existing.options?.length ?? 0) !== (option.options?.length ?? 0)) return false;
		if (existing.options && option.options) {
			return optionsEqual(existing.options, option.options);
		}
	}

	if (
		isChannelOption(existing) &&
		isChannelOption(option) &&
		!unorderedNumberArraysEqual(existing.channel_types, option.channel_types)
	)
		return false;

	if (isNumericalOption(existing) && isNumericalOption(option)) {
		return existing.min_value === option.min_value && existing.max_value === option.max_value;
	}

	if (isStringOption(existing) && isStringOption(option)) {
		return existing.min_length === option.min_length && existing.max_length === option.max_length;
	}

	return true;
}

export function optionsEqual(
	existing: APIApplicationCommandOption[],
	options: AddUndefinedToPossiblyUndefinedPropertiesOfInterface<APIApplicationCommandOption>[],
) {
	if (existing.length !== options.length) return false;
	for (const [index, option] of existing.entries()) {
		const expectedOption = options[index];
		if (!expectedOption || !optionEquals(option, expectedOption)) return false;
	}

	return true;
}

export function commandEquals(existing: APIApplicationCommand, command: RESTPostAPIApplicationCommandsJSONBody) {
	const isGlobal = existing.guild_id === undefined;
	if (
		command.name !== existing.name ||
		('description' in command && command.description !== existing.description) ||
		// Discord API defaults type to chat input
		(command.type ?? ApplicationCommandType.ChatInput) !== existing.type ||
		command.options?.length !== existing.options?.length ||
		(command.default_member_permissions ?? null) !== (existing.default_member_permissions ?? null) ||
		(command.default_permission ?? true) !== (existing.default_permission ?? true) ||
		(command.nsfw ?? false) !== (existing.nsfw ?? false) ||
		(isGlobal &&
			command.contexts === undefined &&
			(command.dm_permission ?? true) !== (existing.dm_permission ?? true)) ||
		(isGlobal && command.contexts !== undefined && !unorderedNumberArraysEqual(command.contexts, existing.contexts)) ||
		(isGlobal &&
			command.integration_types !== undefined &&
			!unorderedNumberArraysEqual(command.integration_types, existing.integration_types)) ||
		(command.handler !== undefined && command.handler !== existing.handler) ||
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
