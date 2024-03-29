import { type PathLike, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import chalk from 'chalk';
import { ApplicationCommandType, type RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';
import type { InteractionsDeployConfig, PathLikeWithDestinationConfig } from '../bin/deploy-interactions';
import type { ApplicationCommandConfig } from './Deploy';

export function getStoredConfig(debug: boolean, overrideConfig?: string): InteractionsDeployConfig | null {
	const cwd = process.cwd();
	const cwdFiles = readdirSync('./');
	let config: InteractionsDeployConfig | null = null;
	if (overrideConfig) {
		try {
			if (overrideConfig.endsWith('.js') || overrideConfig.endsWith('.cjs')) {
				// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
				config = require(`${cwd}/${overrideConfig}`) as InteractionsDeployConfig;
			}

			if (overrideConfig.endsWith('.json')) {
				config = JSON.parse(readFileSync(overrideConfig, 'utf8')) as InteractionsDeployConfig;
			}

			if (!config) throw new Error('Config path provided is not a supported file type');
		} catch (error) {
			if (!debug) {
				console.error(
					'The config option was present but the file could not be located (use --debug to see the full error)',
				);
			}

			if (debug) {
				console.error(chalk`{green Debug} Provided config path could not be resolved`, error);
			}

			throw error;
		}
	}

	if (!config && cwdFiles.includes('.interactionsrc.js')) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
			config = require(`${cwd}/.interactionsrc.js`) as InteractionsDeployConfig;
		} catch (error) {
			if (debug) {
				console.error(chalk`{green Debug} Found js but could not import`, error);
			}
		}
	}

	if (!config && cwdFiles.includes('.interactionsrc.cjs')) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
			config = require(`${cwd}/.interactionsrc.cjs`) as InteractionsDeployConfig;
		} catch (error) {
			if (debug) {
				console.error(chalk`{green Debug} Found cjs but could not import`, error);
			}
		}
	}

	if (!config && cwdFiles.includes('.interactionsrc.json')) {
		try {
			config = JSON.parse(readFileSync('.interactionsrc.json', 'utf8')) as InteractionsDeployConfig;
		} catch (error) {
			if (debug) {
				console.error(chalk`{green Debug} Found json config but could not read`, error);
			}
		}
	}

	if (!config && cwdFiles.includes('package.json')) {
		try {
			const pack = JSON.parse(readFileSync('package.json', 'utf8')) as Record<string, unknown>;
			if (pack.interactionsConfig) {
				config = pack.interactionsConfig as InteractionsDeployConfig;
			}
		} catch (error) {
			if (debug) {
				console.error(chalk`{green Debug} Found json config but could not read`, error);
			}
		}
	}

	return config;
}

function isJSONEncodable(data: unknown): data is Record<string, unknown> & { toJSON(): unknown } {
	return data !== null && typeof data === 'object' && typeof (data as Record<string, unknown>).toJSON === 'function';
}

/**
 * Gets a command from file.
 *
 * @param path - The relative path to the file
 * @param named - If the export is named, the named of the export
 * @returns The processed command
 */
async function getCommand(path: PathLike, named?: string): Promise<RESTPostAPIApplicationCommandsJSONBody> {
	let data: unknown;
	if (typeof path !== 'string' || path.endsWith('.json')) {
		data = JSON.parse(readFileSync(path, 'utf8'));
	} else if (path.endsWith('.js') || path.endsWith('.cjs')) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
			data = require(`${process.cwd()}/${path}`);
		} catch {
			if (path.endsWith('.js')) {
				data = await import(`file://${process.cwd()}/${path}`);
			}
		}

		if (isJSONEncodable(data)) {
			data = data.toJSON();
		}
	}

	if (data && typeof data === 'object') {
		data = named ? (data as Record<string, unknown>)[named] : data;
		if (typeof data !== 'object' || data === null)
			throw new TypeError(`Read command file ${path.toString()} but its export is not a command`);
		const likelyCommand = 'name' in data && ('description' in data || 'type' in data);
		if (!likelyCommand) {
			throw new TypeError(`Read command file ${path.toString()} but its export is not a command`);
		}

		if (!('type' in data)) (data as Record<string, unknown>).type = ApplicationCommandType.ChatInput;
		return data as RESTPostAPIApplicationCommandsJSONBody;
	}

	throw new TypeError('Unexpected file ending');
}

/**
 * Gets all commands from a folder
 *
 * @param path - The relative path to the folder
 * @param debug - Whether to log debug outputs
 * @param named - If the export is named, the named of the export
 * @returns The processed commands
 */
async function getFolderCommands(
	path: string,
	debug: boolean,
	named?: string,
): Promise<RESTPostAPIApplicationCommandsJSONBody[]> {
	const commands: RESTPostAPIApplicationCommandsJSONBody[] = [];
	const dir = readdirSync(path).filter(
		(filename) => filename.endsWith('.js') || filename.endsWith('.cjs') || filename.endsWith('.json'),
	);
	for (const file of dir) {
		try {
			const command = await getCommand(`${path}/${file}`, named);
			commands.push(command);
		} catch (error) {
			if (debug) {
				console.log(chalk`{green Debug}`, error);
			}
		}
	}

	return commands;
}

export interface CommandsResult {
	commands: InteractionsDeployConfig['commandDefinitions'];
	error: boolean;
	finalCommands: ApplicationCommandConfig<RESTPostAPIApplicationCommandsJSONBody>[] | undefined;
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
			} catch (error_) {
				if (debug) {
					console.log(chalk`{green Debug}`, error_);
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

export function storeConfig(config: InteractionsDeployConfig, name: string): boolean {
	try {
		const mutableConfig = { ...config };
		if (mutableConfig.commands?.length) {
			delete mutableConfig.commandDefinitions;
			if (
				typeof mutableConfig.commands[0] === 'object' &&
				(mutableConfig.commands[0] as PathLikeWithDestinationConfig).path
			) {
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
			stringifiedConfig = `module.exports = ${stringifiedConfig.replaceAll(/"(?<key>\w+?)"(?=:)/gi, '$<key>')}`;
		}

		writeFileSync(name, stringifiedConfig);
		return true;
	} catch (error) {
		if (config.debug) {
			console.log(chalk`{green Debug} Error storing config`, error);
		}

		return false;
	}
}
