import { type DiscordAPIError, type HTTPError, REST } from '@discordjs/rest';
import chalk from 'chalk';
import {
	type APIApplicationCommand,
	ApplicationCommandType,
	type RESTGetAPIApplicationCommandsResult,
	type RESTPostAPIApplicationCommandsJSONBody,
	type RESTPostAPIApplicationCommandsResult,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	type RESTPostAPIContextMenuApplicationCommandsJSONBody,
	type RESTPutAPIApplicationCommandsResult,
	Routes,
	type Snowflake,
} from 'discord-api-types/v10';
import { commandEquals } from './Util.js';

/**
 * The configuration for a command to be deployed
 */
export interface ApplicationCommandConfig<CommandType extends RESTPostAPIApplicationCommandsJSONBody> {
	/**
	 * The raw command definition
	 */
	command: CommandType;
	/**
	 * Whether to deploy the command globally
	 */
	global: boolean;
	/**
	 * The ids of the guilds for which the command should be deployed as a guild command
	 */
	guildIds?: Snowflake[] | undefined;
}

/**
 * An implementation of the Map interface with stricter typings depending on the key used
 */
export interface CommandMap
	extends Map<ApplicationCommandType, ApplicationCommandConfig<RESTPostAPIApplicationCommandsJSONBody>[]> {
	get: ((
			key: ApplicationCommandType.Message | ApplicationCommandType.User,
		) => ApplicationCommandConfig<RESTPostAPIContextMenuApplicationCommandsJSONBody>[] | undefined) & ((
		key: ApplicationCommandType.ChatInput,
	) => ApplicationCommandConfig<RESTPostAPIChatInputApplicationCommandsJSONBody>[] | undefined);
}

/**
 * The raw configuration used to deploy commands
 */
export interface DeployConfig {
	/**
	 * The id of the application to deploy the commands to
	 */
	applicationId: Snowflake;
	/**
	 * Whether to overwrite all commands using a single API call for global, and per guild
	 * This is always a forced operation, setting force
	 */
	bulkOverwrite?: boolean | undefined;
	/**
	 * The commands to register
	 */
	commands: CommandMap;
	/**
	 * A guild id to deploy all commmands to which, when provided,
	 * deploys all commands regardless of global or guildIds to the specified guild
	 */
	devGuildId?: Snowflake | undefined;
	/**
	 * Whether to skip all API calls
	 */
	dryRun?: boolean | undefined;
	/**
	 * Whether to skip equality checks for existing commands and just call the API
	 */
	force?: boolean | undefined;
	/**
	 * The bot token used to deploy commands
	 */
	token: string;
}

/**
 * The response from a full deploy
 */
export interface DeployResponse {
	/**
	 * The id of the dev guild deploy if in dev mode
	 */
	dev?: Snowflake;
	/**
	 * If the entire process was halted due to unauth or similar, the error that was encountered
	 */
	error?: DiscordAPIError | HTTPError;
	/**
	 * The global response, if any
	 */
	global?: SingleDeployResponse;
	/**
	 * A map of guild ids to their individual responses
	 */
	guilds: Map<Snowflake, SingleDeployResponse>;
}

/**
 * The response from a deploy to a single destination, either global or guild
 */
export interface SingleDeployResponse {
	/**
	 * The error for deploying all commands in a bulk overwrite
	 */
	bulkError?: DiscordAPIError | HTTPError;
	/**
	 * The commands as received from discord
	 */
	commands: APIApplicationCommand[];
	/**
	 * The commands that failed to deploy
	 */
	errored: ErroredCommand[];
	/**
	 * The skipped commands
	 */
	skipped: SkippedCommand[];
}

/**
 * Represents a command that failed to deploy
 */
export interface ErroredCommand {
	/**
	 * The command that was passed in
	 */
	command: RESTPostAPIApplicationCommandsJSONBody;
	/**
	 * The error that was received while deploying the command
	 */
	error: DiscordAPIError | HTTPError;
	/**
	 * The name of the command that errored
	 */
	name: string;
}

/**
 * Represents a command that was not deployed as it was already up to date or it was a dry run
 */
export interface SkippedCommand {
	/**
	 * The command that was passed in and determined to be up to date
	 */
	command: RESTPostAPIApplicationCommandsJSONBody;
	/**
	 * The existing command from the API
	 */
	existing?: APIApplicationCommand;
	/**
	 * The id of the duplicate, up to date command
	 */
	id?: Snowflake;
	/**
	 * The name of the duplicate, up to date command
	 */
	name: string;
}

let clientId: string;
const rest = new REST({ version: '10' });

/**
 * Separates global commands from guild commands based on their configuration
 *
 * @param commands - The command configurations to separate
 * @returns An array of global commands and the map of guilds to their commands
 */
function separateGlobalGuild<T extends RESTPostAPIApplicationCommandsJSONBody>(
	commands: ApplicationCommandConfig<T>[],
) {
	const globalCommands: T[] = [];
	const guildCommands = new Map<Snowflake, T[]>();
	for (const command of commands) {
		if (command.global) globalCommands.push(command.command);
		if (command.guildIds?.length) {
			for (const id of command.guildIds) {
				if (!guildCommands.has(id)) {
					guildCommands.set(id, []);
				}

				guildCommands.get(id)!.push(command.command);
			}
		}
	}

	return { globalCommands, guildCommands };
}

/**
 * Deploys a set of commands globally or to the specified guild
 *
 * @param commands - The commands to deploy
 * @param force - Whether to skip fetching the existing commands and checking equality
 * @param bulk - Whether to overwrite all commands in scope
 * @param dryRun - Whether to perform a dry run (does not hit the Discord API)
 * @param guildId - The id of the guild to deploy to
 * @returns The status and data of the deploy
 */
async function deploySingleDestination(
	commands: RESTPostAPIApplicationCommandsJSONBody[],
	force: boolean,
	bulk: boolean,
	dryRun: boolean,
	guildId?: Snowflake,
): Promise<SingleDeployResponse> {
	const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
	console.log(`${bulk ? chalk.red('Overwriting') : 'Deploying'} commands ${guildId ? `to ${guildId}` : 'globally'}.`);
	if (dryRun) {
		if (bulk) {
			console.log(chalk`{greenBright Successfully} bulk updated.`);
		} else {
			console.log(`Finished ${guildId ? `guild (${guildId})` : 'global'} deploy`);
		}

		return { skipped: commands.map((command) => ({ name: command.name, command })), errored: [], commands: [] };
	}

	if (bulk) {
		// A promise rejection here is handled by the callee
		const result = (await rest.put(route, { body: commands })) as RESTPutAPIApplicationCommandsResult;
		console.log(chalk`{greenBright Successfully} bulk updated.`);
		return { skipped: [], errored: [], commands: result };
	}

	let existingCommands: RESTGetAPIApplicationCommandsResult = [];
	if (!force) {
		// A promise rejection here is handled by the callee
		existingCommands = (await rest.get(route)) as RESTGetAPIApplicationCommandsResult;
	}

	const added: APIApplicationCommand[] = [];
	const errored: ErroredCommand[] = [];
	const skipped: SkippedCommand[] = [];
	for (const command of commands) {
		if (!force) {
			const existing = existingCommands.find(
				(definition) =>
					(command.type ?? ApplicationCommandType.ChatInput) === definition.type && command.name === definition.name,
			);
			if (existing && commandEquals(existing, command)) {
				skipped.push({ name: existing.name, id: existing.id, command, existing });
				continue;
			}
		}

		const result = (await rest
			.post(route, { body: command })
			.catch((error) => error as DiscordAPIError | HTTPError)) as
			| DiscordAPIError
			| HTTPError
			| RESTPostAPIApplicationCommandsResult;
		if (result instanceof Error) {
			// Pass this up to callee as these errors indicate future requests will fail
			if ([401, 403, 404].includes(result.status)) throw result;
			errored.push({
				name: command.name,
				command,
				error: result,
			});
		} else {
			added.push(result);
		}
	}

	console.log(`Finished ${guildId ? `guild (${guildId})` : 'global'} deploy`);
	return { commands: added, errored, skipped };
}

// Config docs are in DeployConfig interace
/* eslint-disable jsdoc/check-param-names */
/**
 * Deploys a set of application commands
 *
 * @param config - The configuration options for deploying
 * @returns The results of the deploy
 */
/* eslint-enable jsdoc/check-param-names */
export async function deploy({
	applicationId,
	bulkOverwrite = false,
	commands,
	devGuildId,
	dryRun = false,
	force = false,
	token,
}: DeployConfig): Promise<DeployResponse | null> {
	clientId = applicationId;
	if (dryRun) {
		console.log(
			chalk.magentaBright('This is a dry run, all logs suggesting an API call are not actually making calls'),
		);
	} else {
		rest.setToken(token);
	}

	const chatCommands = commands.get(ApplicationCommandType.ChatInput) ?? [];
	const userCommands = commands.get(ApplicationCommandType.User) ?? [];
	const messageCommands = commands.get(ApplicationCommandType.Message) ?? [];
	const allCommands = [...chatCommands, ...userCommands, ...messageCommands];
	if (allCommands.length === 0) {
		return null;
	}

	// Deploy in Dev mode
	if (devGuildId) {
		console.log(
			chalk.blueBright(`Operating in dev mode, all ${allCommands.length} commands deploying to ${devGuildId}.`),
		);
		const deployed = await deploySingleDestination(
			allCommands.map((definition) => definition.command),
			force,
			bulkOverwrite,
			dryRun,
			devGuildId,
		).catch((error) => error as DiscordAPIError | HTTPError);
		if (deployed instanceof Error) {
			if ([401, 403, 404].includes(deployed.status)) return { guilds: new Map(), error: deployed, dev: devGuildId };
			return {
				guilds: new Map<string, SingleDeployResponse>([
					[devGuildId, { bulkError: deployed, errored: [], skipped: [], commands: [] }],
				]),
				dev: devGuildId,
			};
		}

		return { guilds: new Map<string, SingleDeployResponse>([[devGuildId, deployed]]), dev: devGuildId };
	}

	// Separate commands into their destinations
	const response: DeployResponse = {
		guilds: new Map(),
	};
	const { globalCommands, guildCommands: guildCommandsMap } =
		separateGlobalGuild<RESTPostAPIApplicationCommandsJSONBody>(allCommands);
	// Deploy Global commands
	if (globalCommands.length > 0) {
		const deployed = await deploySingleDestination(globalCommands, force, bulkOverwrite, dryRun).catch(
			(error) => error as DiscordAPIError | HTTPError,
		);
		if (deployed instanceof Error) {
			// If the error is unauth or the unlikely 403 / 404, stop all future requests
			if ([401, 403, 404].includes(deployed.status)) return { ...response, error: deployed };
			response.global = { bulkError: deployed, errored: [], skipped: [], commands: [] };
		} else {
			response.global = deployed;
		}
	}

	// Deploy Guild Commands
	for (const [guildId, guildCommands] of guildCommandsMap) {
		const deployed = await deploySingleDestination(guildCommands, force, bulkOverwrite, dryRun, guildId).catch(
			(error) => error as DiscordAPIError | HTTPError,
		);
		if (deployed instanceof Error) {
			// If the error is unauth, stop all future requests, 403 / 404 here can be different per guild
			if (deployed.status === 401) return { ...response, error: deployed };
			response.guilds.set(guildId, { bulkError: deployed, errored: [], skipped: [], commands: [] });
		} else {
			response.guilds.set(guildId, deployed);
		}
	}

	return response;
}

export default deploy;
