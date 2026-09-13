import type { PathLike } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import chalkTemplate from 'chalk-template';
import { ApplicationCommandType, type RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';
import type { InteractionsDeployConfig, PathLikeWithDestinationConfig } from '../bin/deploy-interactions.js';
import type { ApplicationCommandConfig } from './Deploy.js';

async function importModule(path: string): Promise<Record<string, unknown>> {
	const url = pathToFileURL(resolve(path)).href;
	return import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>;
}

async function readConfig(path: string): Promise<InteractionsDeployConfig> {
	if (path.endsWith('.json')) {
		return JSON.parse(await readFile(path, 'utf8')) as InteractionsDeployConfig;
	}

	const imported = await importModule(path);
	return (imported.default ?? imported) as InteractionsDeployConfig;
}

export async function getStoredConfig(
	debug: boolean,
	overrideConfig?: string,
): Promise<InteractionsDeployConfig | null> {
	const cwd = process.cwd();
	const cwdFiles = new Set(await readdir('.'));
	if (overrideConfig) {
		try {
			if (!/\.(?:cjs|js|json|mjs)$/i.test(overrideConfig)) {
				throw new Error('Config path provided is not a supported file type');
			}

			return await readConfig(overrideConfig);
		} catch (error) {
			if (!debug) {
				console.error(
					'The config option was present but the file could not be located (use --debug to see the full error)',
				);
			}

			if (debug) {
				console.error(chalkTemplate`{green Debug} Provided config path could not be resolved`, error);
			}

			throw error;
		}
	}

	const configCandidates = ['.interactionsrc.js', '.interactionsrc.mjs', '.interactionsrc.cjs', '.interactionsrc.json'];
	for (const candidate of configCandidates) {
		if (!cwdFiles.has(candidate)) continue;

		try {
			return await readConfig(resolve(cwd, candidate));
		} catch (error) {
			if (debug) {
				console.error(chalkTemplate`{green Debug} Found ${candidate} but could not load it`, error);
			}
		}
	}

	if (cwdFiles.has('package.json')) {
		try {
			const pack = JSON.parse(await readFile('package.json', 'utf8')) as Record<string, unknown>;
			if (pack.interactionsConfig) {
				return pack.interactionsConfig as InteractionsDeployConfig;
			}
		} catch (error) {
			if (debug) {
				console.error(chalkTemplate`{green Debug} Found package.json but could not read interactionsConfig`, error);
			}
		}
	}

	return null;
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
		data = JSON.parse(await readFile(path, 'utf8'));
	} else if (/\.(?:cjs|js|mjs)$/i.test(path)) {
		const imported = await importModule(path);
		if (named) {
			const defaultExport = imported.default;
			data =
				imported[named] ??
				(defaultExport && typeof defaultExport === 'object'
					? (defaultExport as Record<string, unknown>)[named]
					: undefined);
		} else {
			data = imported.default ?? imported;
		}

		if (isJSONEncodable(data)) {
			data = data.toJSON();
		}
	}

	if (data && typeof data === 'object') {
		if (named && (typeof path !== 'string' || path.endsWith('.json'))) {
			data = (data as Record<string, unknown>)[named];
		}

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
	const dir = (await readdir(path)).filter((filename) => /\.(?:cjs|js|json|mjs)$/i.test(filename));
	const commands = await Promise.all(
		dir.map(async (file): Promise<RESTPostAPIApplicationCommandsJSONBody | null> => {
			try {
				return await getCommand(resolve(path, file), named);
			} catch (error) {
				if (debug) {
					console.log(chalkTemplate`{green Debug}`, error);
				}

				return null;
			}
		}),
	);

	return commands.filter((command): command is RESTPostAPIApplicationCommandsJSONBody => command !== null);
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
		if (typeof path !== 'string' || /\.(?:cjs|js|json|mjs)$/i.test(path)) {
			try {
				pathCommands.push(await getCommand(path, named));
			} catch (error_) {
				if (debug) {
					console.log(chalkTemplate`{green Debug}`, error_);
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
		console.error(chalkTemplate`{redBright Error} No commands found in all specified directories!`);
		error = true;
	}

	return {
		commands: commands.length ? commands : undefined,
		finalCommands: finalCommands.length ? finalCommands : undefined,
		error,
	};
}

export async function storeConfig(config: InteractionsDeployConfig, name: string): Promise<boolean> {
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
		const javascriptConfig = stringifiedConfig.replaceAll(/"(?<key>\w+?)"(?=:)/gi, '$<key>');
		if (name.endsWith('.cjs')) {
			stringifiedConfig = `module.exports = ${javascriptConfig};\n`;
		} else if (name.endsWith('.js') || name.endsWith('.mjs')) {
			stringifiedConfig = `export default ${javascriptConfig};\n`;
		} else {
			stringifiedConfig += '\n';
		}

		await writeFile(name, stringifiedConfig);
		return true;
	} catch (error) {
		if (config.debug) {
			console.log(chalkTemplate`{green Debug} Error storing config`, error);
		}

		return false;
	}
}
