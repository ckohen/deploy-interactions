#!/usr/bin/env node

import { Command } from 'commander';
import { createInterface as createPrompt } from 'readline';
import { version } from '../../package.json';
import * as dotenv from 'dotenv';
import { existsSync, PathLike } from 'fs';
import { ApplicationCommandType, RESTPostAPIApplicationCommandsJSONBody, Snowflake } from 'discord-api-types/v9';
import { getCommands, getStoredConfig, storeConfig } from '../lib/FileParser';
import chalk from 'chalk';
import deploy, { ApplicationCommandConfig, CommandMap, DeployResponse } from '../lib/Deploy';
import outputResults from '../lib/LogCompiler';

/**
 * The configuration that can be used to deploy commands using the `deploy-interactions` commands
 */
export interface InteractionsDeployConfig {
	/**
	 * Whether to overwrite all commands when deploying (uses the PUT endpoint instead of POST)
	 * **Always skips equality checks**
	 */
	bulkOverwrite?: boolean;
	/**
	 * The id of the client / application to deploy commands to
	 */
	clientId?: Snowflake;
	/**
	 * The raw definitions for deploying commands. *It is stronly recommended against using this key
	 * unless the config file is the only place where you store command definitions*
	 *
	 * **WARNING: this key is ignored when `commands` is set**
	 */
	commandDefinitions?: RESTPostAPIApplicationCommandsJSONBody[];
	/**
	 * The configured destinations for deploying commands
	 *
	 * **WARNING: this key is ignored when `commands` contains the destination configs**
	 */
	commandDestinations?: InteractionsDeployDestinationsConfig;
	/**
	 * The paths to load command definitions from, possibly with deployment configs for the entire path
	 */
	commands?: PathLike[] | PathLikeWithDestinationConfig[];
	/**
	 * Runs the deployment in debug mode, with much more verbose output
	 *
	 * *Enables `full` inhernetly*
	 */
	debug?: boolean;
	/**
	 * Whether to run deployment in dev mode (deploying all commands to a single guild regardless of other config)
	 *
	 * *Enables `full` inhernetly*
	 */
	developer?: boolean;
	/**
	 * The id of the guild to use when running in developer mode
	 */
	devGuildId?: Snowflake;
	/**
	 * Skips the actual API deployment stage and outputs the full summary of deployment
	 *
	 * *Enables `full` inhernetly*
	 */
	dryRun?: boolean;
	/**
	 * Skips the equality checks when deploying commands
	 */
	force?: boolean;
	/**
	 * Outputs the full compiled list after deployment
	 *
	 * *`dryRun`, `developer`, and `debug` also result in this behavior*
	 */
	full?: boolean;
	/**
	 * The name of the export in the command files, if the command definition is not the default export
	 */
	namedExport?: string;
	/**
	 * Enables printing summary view after deployment
	 *
	 * *Note: Summary will not display when `full` is enabled (`dryRun`, `developer`, and `debug` enable `full`)*
	 */
	summary?: boolean;
	/**
	 * The token to use for deploying to the specified application.
	 *
	 * **Please do not store this token in your config directly,
	 * it is highly recommended to use a js file for config and access a `process.env` key.**
	 * Note that `dotenv.config()` is called when loading stored configs to ensure your `.env` file key is available
	 */
	token?: string;
}

const DefaultConfig: InteractionsDeployConfig = {
	bulkOverwrite: false,
	debug: false,
	developer: undefined,
	dryRun: false,
	force: false,
};

/**
 * The path and the destinations that all commands specified in the path will go to
 */
export interface PathLikeWithDestinationConfig {
	/**
	 * The path to the file(s) that uses this destination config
	 */
	path: PathLike;
	/**
	 * The destination config that applies to all items found in the path
	 */
	destinations: { global: boolean; guildIds?: Snowflake[] };
}

/**
 * A record of configured destinations for where commands are being deployed
 */
export interface InteractionsDeployDestinationsConfig {
	/**
	 * The identifiers of the commands to be deployed globally
	 */
	global?: InteractionsDeployCommandConfig[];
	/**
	 * The identifiers of the commands to be deployed to the specified guildId
	 */
	[guildId: string]: InteractionsDeployCommandConfig[] | undefined;
}

/**
 * The name and type of a command to be deployed, effectively an id before one exists
 */
export interface InteractionsDeployCommandConfig {
	/**
	 * The name of the command
	 */
	name: string;
	/**
	 * The type of application command (names are unique per type)
	 * @default ApplicationCommandType.ChatInput
	 */
	type?: ApplicationCommandType;
}

interface CommandOptions {
	bulkOverwrite?: boolean;
	clientId?: Snowflake;
	commands?: string[];
	config?: string;
	debug?: boolean;
	developer?: boolean | string;
	dryRun?: boolean;
	force?: boolean;
	full?: boolean;
	global: boolean;
	namedExport?: string;
	store?: boolean | string;
	summary: boolean;
	token?: string;
}

// Setup executing CLI
const command = new Command();
command.showHelpAfterError('(add --help for additional information)');
command
	.option('-t, --token <token>', 'The bot token for your application')
	.option('-i, --client-id <clientId>')
	.option('-c, --commands <files...>', 'The path(s) to the files which contain commands to be deployed')
	.option('-d, --developer [guildId]', 'Run deployment in developer mode (deploy to a single guild)')
	.option('-b, --bulk-overwrite', 'Overwrite all commands')
	.option('-f, --force', 'Skip equality checks and call the API directly')
	.option('--no-global', 'Disable global deployment, only deploy to guilds')
	.option('-n, --named-export <name>', 'Use the specified name when looking for command exports')
	.option('-r, --dry-run', 'Only runs file parsing logic and does not deploy to discord')
	.option('--no-summary', 'Disable the output of the summary after deployment')
	.option('--full', 'Enable output of the full deployment status')
	.option(
		'-s, --store [filename]',
		'Store the generated configuration (excluding token) to .interactionsrc.json or the specified file',
	)
	.option('--config <file>', 'The path to a configuration file to use (js, json)')
	.option('--debug', 'Output debug logs from file parsing')
	.version(version);

command.parse();

const overrideOptions = command.opts<CommandOptions>();

/**
 * We use process.cwd() and dotenv to locate configs and the commands,
 * advise adding npm script so cwd is always what is expected
 */
dotenv.config(); // Not sure if this should be called here or let users call it

// Setup additional prompt CLI
const prompt = createPrompt({
	input: process.stdin,
	output: process.stdout,
});

async function runAsync() {
	let store: string | null =
		typeof overrideOptions.store === 'string'
			? overrideOptions.store
			: overrideOptions.store === true
			? '.interactionsrc.json'
			: null;
	/**
	 * For options not provided, attempt to read config from:
	 * .interactionsrc.js
	 * .interactionsrc.cjs
	 * .interactionsrc.json
	 * package.json - interactionsConfig
	 */
	let storedConfig: InteractionsDeployConfig = {};
	try {
		storedConfig = (await getStoredConfig(overrideOptions.debug ?? false, overrideOptions.config)) ?? {};
	} catch {
		prompt.close();
		process.exit(1);
	}
	const config: InteractionsDeployConfig = { ...DefaultConfig, ...storedConfig };

	// Check if its likely the first time run, if so ask if user wants to store
	if (Object.keys(storedConfig).length === 0 && Object.keys(overrideOptions).length === 1 && overrideOptions.global) {
		console.log(chalk.blueBright('No Stored Configuration found'));
		const cliStore = await getYesNoInput('Would you like to store the config being generated?');
		if (cliStore) {
			store = await getInput<string>({
				query: 'Filename of the config file (default: .interactionsrc.json)',
				transformer: (input) => {
					// Set default on just enter
					if (input === '') return '.interactionsrc.json';
					return input;
				},
			});
		}
	}

	mergeOverrides(config, overrideOptions);

	// Collect client id if not stored or provided
	if (!('clientId' in config)) {
		config.clientId = await getInput({
			query: 'Please enter the Application / Client ID found in the developer portal',
			validator: (input) => input.length >= 16 && input.length <= 20,
		});
	}

	// Collect token if not stored or provided
	// At this time, client credential token is not supported
	if (!('token' in config)) {
		config.token = await getInput({
			query: 'Please enter the bot token found in the developer portal',
			validator: (input) => input.length >= 26,
		});
	}

	// Determine whether or not we need to go through the destination set up flow
	let wantsDestinations = !overrideOptions.global;
	// Collect command file location if not provided and not store in some manner
	if ((!('commands' in config) || config.commands!.length === 0) && !('commandDefinitions' in config)) {
		config.commands = await getInput<PathLike[]>({
			query: 'Please enter the path (relative to the current directory) to the files containing command definitions',
			transformer: (input) => {
				if (existsSync(input)) return [input];
				return [];
			},
			validator: (input) => {
				if (input.length) return true;
				console.log(chalk.redBright('The file or folder specified does not seem to exist'));
				return false;
			},
		});
		// Collect named export details if not provided and not stored
		if (!('namedExport' in config)) {
			const isDefault = await getYesNoInput(
				'Is the command definition (API ready) the default export in the provided files?',
			);
			if (!isDefault) {
				config.namedExport = await getInput({
					query: 'Please enter the key for the export that contains the command definition',
					validator: (input) => Boolean(input.length),
				});
			}
		}
		// Skip destination check in developer mode, everything is going to the same place
		if (!config.developer && !('commandDestinations' in config)) {
			wantsDestinations = await getYesNoInput('Would you like to configure guild deployment alongside global?');
		}
	}

	let deployableCommands: ApplicationCommandConfig<RESTPostAPIApplicationCommandsJSONBody>[] = [];

	//
	if (config.commands !== undefined) {
		const { commands, finalCommands, error } = await getCommands(
			config.commands,
			!overrideOptions.global,
			config.debug ?? false,
			config.namedExport,
		);
		if (error) {
			prompt.close();
			process.exit(1);
		}

		if (commands !== undefined) {
			config.commandDefinitions = commands;
		}

		if (finalCommands !== undefined) {
			deployableCommands = finalCommands;
		}
	}

	// Destination set up flow if not stored in config, not in dev mode (single guild id),
	// or if global deployment was negated and the deployable commands do not have any guild ids
	if (
		!config.developer &&
		wantsDestinations &&
		!('commandDestinations' in config) &&
		(deployableCommands.length === 0 || deployableCommands.every((c) => !Boolean(c.guildIds?.length)))
	) {
		let getGuildsOnly = true;
		if (deployableCommands.length) {
			// This can only be reached when global has been disabled and the commands config had no guilds configured
			// Move all commands to definitions since we don't care about their global state and guilIds is empty
			config.commandDefinitions = deployableCommands.map((c) => c.command);
			deployableCommands = [];
		}
		const validNames = config.commandDefinitions!.map((c) => c.name);
		console.log(chalk`{cyan Commands found}: {yellowBright ${validNames.join(', ')}}`);
		// Determine whether this is first time setup, and if so, check global deploy config
		let deployAllGlobal = false;
		if (overrideOptions.global) {
			deployAllGlobal = await getYesNoInput('First, do you want all commands to be deployed globally?');
			if (!deployAllGlobal) getGuildsOnly = false;
		}

		let globalCommands: InteractionsDeployCommandConfig[] = deployAllGlobal
			? config.commandDefinitions!.map((c) => ({
					name: c.name,
					type: c.type ?? ApplicationCommandType.ChatInput,
			  }))
			: [];
		const guildCommands = new Map<Snowflake, InteractionsDeployCommandConfig[]>();
		if (!deployAllGlobal && !getGuildsOnly) {
			globalCommands = await getCommandNamesInput(validNames, config.commandDefinitions!);
		}
		let done = false;
		let count = 1;
		while (!done) {
			const guildId = await getInput({
				query: `(Guild ${count}) Please provide an id for the guild to configure command deployment on`,
				validator: (input) => input.length >= 16 && input.length <= 20,
			});
			const commands = await getCommandNamesInput(validNames, config.commandDefinitions!, guildId);
			guildCommands.set(guildId, commands);
			count += 1;
			if (await getYesNoInput('Do you have another guild to deploy to?')) continue;
			done = true;
		}
		// Assign destination values to config
		config.commandDestinations = { global: globalCommands };
		for (const [guildId, conf] of guildCommands) {
			config.commandDestinations[guildId] = conf;
		}
	}

	if (deployableCommands.length === 0) {
		deployableCommands = config.commandDefinitions!.map((command) => {
			const conf: ApplicationCommandConfig<RESTPostAPIApplicationCommandsJSONBody> = {
				command,
				global: overrideOptions.global,
				guildIds: [],
			};
			if (config.commandDestinations) {
				for (const [guild, deployConfig] of Object.entries(config.commandDestinations)) {
					if (!deployConfig) continue;
					if (guild === 'global') {
						if (!overrideOptions.global) continue;
						conf.global = deployConfig.some(
							(c) =>
								c.name === command.name &&
								(c.type ?? ApplicationCommandType.ChatInput) === (command.type ?? ApplicationCommandType.ChatInput),
						);
						continue;
					}
					if (
						deployConfig.some(
							(c) =>
								c.name === command.name &&
								(c.type ?? ApplicationCommandType.ChatInput) === (command.type ?? ApplicationCommandType.ChatInput),
						)
					) {
						conf.guildIds!.push(guild);
					}
				}
			}
			return conf;
		});
	}

	if (config.developer && !('devGuildId' in config)) {
		config.devGuildId = await getInput({
			query: chalk`{green Developer Mode Enabled}, please provide an id for the guild to deploy commands to`,
			validator: (input) => input.length >= 16 && input.length <= 20,
		});
	}

	if (store) {
		storeConfig(config, store);
	}

	let results: DeployResponse | null = null;

	if (!config.dryRun) {
		const deployReady: CommandMap = new Map([
			[
				ApplicationCommandType.ChatInput,
				deployableCommands.filter(
					(c) => (c.command.type ?? ApplicationCommandType.ChatInput) === ApplicationCommandType.ChatInput,
				),
			],
			[ApplicationCommandType.User, deployableCommands.filter((c) => c.command.type === ApplicationCommandType.User)],
			[
				ApplicationCommandType.Message,
				deployableCommands.filter((c) => c.command.type === ApplicationCommandType.Message),
			],
		]) as CommandMap;
		results = await deploy({
			applicationId: config.clientId!,
			bulkOverwrite: config.bulkOverwrite,
			commands: deployReady,
			devGuildId: config.developer ? config.devGuildId : undefined,
			force: config.force,
			token: config.token!,
		});
	}

	if (results === null) {
		console.log('No commands found to deploy!');
	} else {
		outputResults(
			results,
			config.debug ?? false,
			config.dryRun ?? false,
			config.full ?? false,
			!(config.summary ?? true),
		);
	}

	// Close at end to not "close" the program, communicating unfinished state
	prompt.close();
}

void runAsync().catch(console.error);

// Utility functions
async function disambiguate(
	names: string[],
	commands: RESTPostAPIApplicationCommandsJSONBody[],
): Promise<InteractionsDeployCommandConfig[]> {
	const disambiguated: InteractionsDeployCommandConfig[] = [];
	const TypeNames = {
		[ApplicationCommandType.ChatInput]: 'Chat Input Command',
		[ApplicationCommandType.User]: 'User Command',
		[ApplicationCommandType.Message]: 'Message Command',
	};
	for (const name of names) {
		const possibleCommands = commands.filter((c) => c.name === name);
		if (possibleCommands.length === 1) {
			disambiguated.push({ name, type: possibleCommands[0].type ?? ApplicationCommandType.ChatInput });
			continue;
		}
		// Compile type list: Chat Input Command, User Command, and Message Command
		const commandTypes = possibleCommands.reduce((str, current, i) => {
			const currentName = TypeNames[current.type ?? ApplicationCommandType.ChatInput];
			switch (i) {
				case 0:
					return currentName;
				case 1:
					if (possibleCommands.length === 2) return `${str} and ${currentName}`;
				case possibleCommands.length - 1:
					return `${str}, and ${currentName}`;
				default:
					return `${str}, ${currentName}`;
			}
		}, '');
		// Get the type that the user wants to keep
		console.log(`The name ${name} matches commands with types ${commandTypes}.`);
		const keepType = await getInput<ApplicationCommandType | 0 | -1>({
			query: `Please enter the first letter (e.g. u for user) of the type of command that this config is for (or a for all)`,
			transformer: (input) => {
				if (!['a', 'c', 'm', 'u'].includes(input.toLowerCase())) return -1;
				switch (input.toLowerCase()) {
					case 'c':
						return ApplicationCommandType.ChatInput;
					case 'u':
						return ApplicationCommandType.User;
					case 'm':
						return ApplicationCommandType.Message;
					case 'a':
						return 0;
					default:
						return -1;
				}
			},
			validator: (input) => input !== -1,
		});
		// User wants all
		if (keepType === 0) {
			for (const command of possibleCommands) {
				disambiguated.push({ name, type: command.type ?? ApplicationCommandType.ChatInput });
			}
			continue;
		}
		disambiguated.push({ name, type: keepType });
	}
	return disambiguated;
}

function mergeOverrides(output: InteractionsDeployConfig, input: CommandOptions) {
	if ('bulkOverwrite' in input) output.bulkOverwrite = input.bulkOverwrite;
	if ('clientId' in input) output.clientId = input.clientId;
	if ('commands' in input) output.commands = input.commands;
	if ('debug' in input) output.debug = input.debug;
	if ('developer' in input) {
		output.developer = true;
		if (typeof input.developer === 'string') {
			output.devGuildId = input.developer;
		}
	} else if (!('developer' in output)) {
		output.developer = false;
	}
	if ('dryRun' in input) output.dryRun = input.dryRun;
	if ('force' in input) output.force = input.force;
	if ('full' in input) output.full = input.full;
	if ('namedExport' in input) output.namedExport = input.namedExport;
	if (!input.summary) output.summary = input.summary;
	if ('token' in input) output.token = input.token;
}

interface InputOptions<T = string> {
	query: string;
	transformer?: (input: string) => T;
	validator?: (input: T | string) => boolean;
}

async function getCommandNamesInput(
	validNames: string[],
	commandDefinitions: RESTPostAPIApplicationCommandsJSONBody[],
	guildId?: Snowflake,
): Promise<InteractionsDeployCommandConfig[]> {
	const destination = guildId ? `to ${guildId}` : 'globally';
	const commandNames = await getInput<string[]>({
		query: `In a space separated list, enter the names of the commands which should be deployed ${destination}`,
		transformer: (input) => input.split(' '),
		validator: (input) => {
			if (!Boolean(input.length)) return false;
			for (const name of input as string[]) {
				if (!validNames.includes(name)) {
					console.log(chalk.redBright(`Unknown command (name: ${name}), please enter the list again`));
					return false;
				}
			}
			return true;
		},
	});
	const commands = await disambiguate(commandNames, commandDefinitions);
	return commands;
}

async function getYesNoInput(query: string): Promise<boolean> {
	const out = await getInput<boolean | null>({
		query: `${query} (Y/N)`,
		transformer: (input) => {
			if (input.toLowerCase() === 'y') return true;
			if (input.toLowerCase() === 'n') return false;
			return null;
		},
		validator: (input) => {
			if (input === null) return false;
			return true;
		},
	});
	// Something went really wrong
	if (out === null) throw new Error('Received null when it should not possible');
	return out;
}

async function getInput<T>(
	options:
		| (InputOptions<T> & { transformer: (input: string) => T })
		| (InputOptions<T> & { transformer: (input: string) => T; validator: (input: T) => boolean }),
): Promise<T>;
async function getInput(
	options: InputOptions | (InputOptions & { validator: (input: string) => boolean }),
): Promise<string>;
async function getInput<T = string>({ query, transformer, validator }: InputOptions<T>): Promise<T | string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
		prompt.close();
		console.error(chalk.red('No required input for 1 minute, exiting'));
		process.exit(1);
	}, 60_000).unref();
	const response = await new Promise<string>((res) => {
		prompt.question(`${query}: `, { signal: controller.signal }, (input) => {
			res(input);
		});
	}).finally(() => clearTimeout(timeout));
	let output: T | string = response;
	if (transformer) {
		output = transformer(response);
	}

	if (validator) {
		if (!validator(output)) {
			if (transformer) {
				return getInput<T>({ query, transformer, validator });
			}

			return getInput({ query, validator });
		}
	}

	return output;
}
