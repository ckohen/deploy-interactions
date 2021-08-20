import chalk from 'chalk';
import { ApplicationCommandType, RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v9';
import { PathLike, readdirSync, readFileSync, writeFileSync } from 'fs';
import type { InteractionsDeployConfig, PathLikeWithDestinationConfig } from '../bin/deploy-interactions';
import type { ApplicationCommandConfig } from './Deploy';

export async function getStoredConfig(
	debug: boolean,
	overrideConfig?: string,
): Promise<InteractionsDeployConfig | null> {
	const cwd = process.cwd();
	const cwdFiles = readdirSync('./');
	let config: InteractionsDeployConfig | null = null;
	if (overrideConfig) {
		try {
			if (overrideConfig.endsWith('.js') || overrideConfig.endsWith('.cjs')) {
				config = await import(`${cwd}/${overrideConfig}`);
			}
			if (overrideConfig.endsWith('.json')) {
				config = JSON.parse(readFileSync(overrideConfig, 'utf8'));
			}
			if (!config) throw new Error('Config path provided is not a supported file type');
		} catch (err) {
			if (!debug) {
				console.error(
					'The config option was present but the file could not be located (use --debug to see the full error)',
				);
			}
			if (debug) {
				console.error(chalk`{green Debug} Provided config path could not be resolved`, err);
			}
			throw err;
		}
	}
	if (!config && cwdFiles.includes('.interactionsrc.js')) {
		try {
			config = await import(`${cwd}/.interactionsrc.js`);
		} catch (err) {
			if (debug) {
				console.error(chalk`{green Debug} Found js but could not import`, err);
			}
		}
	}

	if (!config && cwdFiles.includes('.interactionsrc.cjs')) {
		try {
			config = await import(`${cwd}/.interactionsrc.cjs`);
		} catch (err) {
			if (debug) {
				console.error(chalk`{green Debug} Found cjs but could not import`, err);
			}
		}
	}

	if (!config && cwdFiles.includes('.interactionsrc.json')) {
		try {
			config = JSON.parse(readFileSync('.interactionsrc.json', 'utf8'));
		} catch (err) {
			if (debug) {
				console.error(chalk`{green Debug} Found json config but could not read`, err);
			}
		}
	}

	if (!config && cwdFiles.includes('package.json')) {
		try {
			const pack = JSON.parse(readFileSync('package.json', 'utf8'));
			if (pack.interactionsConfig) {
				config = pack.interactionsConfig;
			}
		} catch (err) {
			if (debug) {
				console.error(chalk`{green Debug} Found json config but could not read`, err);
			}
		}
	}

	return config;
}

export interface CommandsResult {
	commands: InteractionsDeployConfig['commandDefinitions'];
	finalCommands: ApplicationCommandConfig<RESTPostAPIApplicationCommandsJSONBody>[] | undefined;
	error: boolean;
}

export async function getCommands(
	paths: Exclude<InteractionsDeployConfig['commands'], undefined>,
	overrideGlobal: boolean,
	debug: boolean,
	named?: string,
): Promise<CommandsResult> {
	const commands: RESTPostAPIApplicationCommandsJSONBody[] = [];
	const finalCommands: ApplicationCommandConfig<RESTPostAPIApplicationCommandsJSONBody>[] = [];
	let error = false;
	for (let path of paths) {
		let pathDestinations: PathLikeWithDestinationConfig['destinations'] | null = null;
		let pathCommands: RESTPostAPIApplicationCommandsJSONBody[] = [];
		if (typeof path === 'object' && 'path' in path) {
			pathDestinations = path.destinations;
			path = path.path;
		}

		// If the file is a single file
		if (typeof path !== 'string' || path.endsWith('.js') || path.endsWith('.cjs') || path.endsWith('.json')) {
			try {
				pathCommands.push(await getCommand(path, named));
			} catch (err) {
				if (debug) {
					console.log(chalk`{green Debug}`, err);
				}
			}
		} else {
			// The path is a folder path
			pathCommands = await getFolderCommands(path, debug, named);
		}
		if (pathCommands.length === 0) continue;
		// Add all found commands to the appropriate array
		for (const command of pathCommands) {
			if (pathDestinations) {
				finalCommands.push({
					command,
					global: overrideGlobal ? false : pathDestinations.global,
					guildIds: pathDestinations.guildIds,
				});
			} else {
				commands.push(command);
			}
		}
	}
	if (commands.length === 0 && finalCommands.length === 0) {
		console.error(chalk`{redBright Error} No commands found in all specified directories!`);
		error = true;
	}
	return {
		commands: commands.length ? commands : undefined,
		finalCommands: finalCommands.length ? finalCommands : undefined,
		error,
	};
}

/**
 * Gets all commands from a folder
 * @param path The relative path to the folder
 * @param debug Whether to log debug outputs
 * @param named If the export is named, the named of the export
 * @returns The processed commands
 */
async function getFolderCommands(
	path: string,
	debug: boolean,
	named?: string,
): Promise<RESTPostAPIApplicationCommandsJSONBody[]> {
	const commands: RESTPostAPIApplicationCommandsJSONBody[] = [];
	const dir = readdirSync(path).filter((f) => f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.json'));
	for (const file of dir) {
		try {
			const command = await getCommand(`${path}/${file}`, named);
			commands.push(command);
		} catch (err) {
			if (debug) {
				console.log(chalk`{green Debug}`, err);
			}
		}
	}
	return commands;
}

/**
 * Gets a command from file.
 * @param path The relative path to the file
 * @param named If the export is named, the named of the export
 * @returns The processed command
 */
async function getCommand(path: PathLike, named?: string): Promise<RESTPostAPIApplicationCommandsJSONBody> {
	let data;
	if (typeof path !== 'string' || path.endsWith('.json')) {
		data = JSON.parse(readFileSync(path, 'utf8'));
	} else if (path.endsWith('.js') || path.endsWith('.cjs')) {
		data = await import(`${process.cwd()}/${path}`);
		if (typeof data.toJSON === 'function') {
			data = data.toJSON();
		}
	}
	if (data) {
		data = named ? data[named] : data;
		const likelyCommand = 'name' in data && ('description' in data || 'type' in data);
		if (!likelyCommand) {
			throw new TypeError(`Read command file ${path.toString()} but its export is not a command`);
		}
		if (!('type' in data)) data.type = ApplicationCommandType.ChatInput;
		return data;
	}
	throw new TypeError('Unexpected file ending');
}

export function storeConfig(config: InteractionsDeployConfig, name: string): boolean {
	try {
		const mutableConfig = { ...config };
		if (mutableConfig.commands?.length) {
			delete mutableConfig.commandDefinitions;
			// @ts-expect-error
			if (typeof mutableConfig.commands[0] === 'object' && mutableConfig.commands[0].path) {
				delete mutableConfig.commandDestinations;
			}
		}
		// Don't store default config options
		const defaultFalseKeys: (keyof InteractionsDeployConfig)[] = ['bulkOverwrite', 'debug', 'dryRun', 'force'];
		if (mutableConfig.developer === undefined) {
			delete mutableConfig.developer;
		}
		for (const key of defaultFalseKeys) {
			if (mutableConfig[key] === false) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete mutableConfig[key];
			}
		}
		// Don't store the token
		delete mutableConfig.token;
		let stringifiedConfig = JSON.stringify(mutableConfig, null, '\t');
		if (name.endsWith('.js') || name.endsWith('.cjs')) {
			stringifiedConfig = `module.exports = ${stringifiedConfig.replace(/"(\w+?)"(?=:)/gi, '$1')}`;
		}
		writeFileSync(name, stringifiedConfig);
		return true;
	} catch (err) {
		if (config.debug) {
			console.log(chalk`{green Debug} Error storing config`, err);
		}
		return false;
	}
}
