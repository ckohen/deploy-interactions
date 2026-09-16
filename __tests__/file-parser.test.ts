import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getCommands, getStoredConfig, storeConfig } from '../src/lib/FileParser.js';

describe('asynchronous file parsing', () => {
	let temporaryDirectory: string;

	beforeEach(async () => {
		temporaryDirectory = await mkdtemp(join(tmpdir(), 'deploy-interactions-'));
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(temporaryDirectory, { recursive: true, force: true });
	});

	test('loads ESM, CommonJS, and JSON command definitions', async () => {
		await Promise.all([
			writeFile(
				join(temporaryDirectory, 'esm-command.mjs'),
				"export default { name: 'esm', description: 'ESM command' };\n",
			),
			writeFile(
				join(temporaryDirectory, 'commonjs-command.cjs'),
				"module.exports = { name: 'commonjs', description: 'CommonJS command' };\n",
			),
			writeFile(
				join(temporaryDirectory, 'json-command.json'),
				JSON.stringify({ name: 'json', description: 'JSON command' }),
			),
		]);

		const result = await getCommands([temporaryDirectory], false, false);

		expect(result.error).toBe(false);
		expect(result.commands?.map(({ name }) => name).sort()).toEqual(['commonjs', 'esm', 'json']);
	});

	test('loads an explicit ESM configuration', async () => {
		const configPath = join(temporaryDirectory, 'interactions.config.mjs');
		await writeFile(configPath, "export default { clientId: '1234567890123456', dryRun: true };\n");

		await expect(getStoredConfig(false, configPath)).resolves.toMatchObject({
			clientId: '1234567890123456',
			dryRun: true,
		});
	});

	test.each([
		['json', JSON.stringify({ clientId: '1234567890123456', dryRun: true })],
		['cjs', "module.exports = { clientId: '1234567890123456', dryRun: true };\n"],
	])('loads an explicit %s configuration', async (extension, source) => {
		const configPath = join(temporaryDirectory, `interactions.config.${extension}`);
		await writeFile(configPath, source);

		await expect(getStoredConfig(false, configPath)).resolves.toMatchObject({
			clientId: '1234567890123456',
			dryRun: true,
		});
	});

	test.each([false, true])('rejects unsupported explicit configuration files (debug: %s)', async (debug) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const configPath = join(temporaryDirectory, 'interactions.config.txt');

		await expect(getStoredConfig(debug, configPath)).rejects.toThrow('not a supported file type');
		expect(error).toHaveBeenCalled();
	});

	test('discovers the first loadable configuration candidate', async () => {
		const originalDirectory = process.cwd();
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		await Promise.all([
			writeFile(join(temporaryDirectory, '.interactionsrc.js'), 'not valid JavaScript'),
			writeFile(
				join(temporaryDirectory, '.interactionsrc.json'),
				JSON.stringify({ clientId: '1234567890123456', dryRun: true }),
			),
		]);

		try {
			process.chdir(temporaryDirectory);
			await expect(getStoredConfig(true)).resolves.toMatchObject({
				clientId: '1234567890123456',
				dryRun: true,
			});
		} finally {
			process.chdir(originalDirectory);
		}

		expect(error).toHaveBeenCalled();
	});

	test('loads configuration from package.json', async () => {
		const originalDirectory = process.cwd();
		await writeFile(
			join(temporaryDirectory, 'package.json'),
			JSON.stringify({ interactionsConfig: { clientId: '1234567890123456', force: true } }),
		);

		try {
			process.chdir(temporaryDirectory);
			await expect(getStoredConfig(false)).resolves.toEqual({ clientId: '1234567890123456', force: true });
		} finally {
			process.chdir(originalDirectory);
		}
	});

	test('returns null when discovered configuration cannot be loaded', async () => {
		const originalDirectory = process.cwd();
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		await writeFile(join(temporaryDirectory, 'package.json'), '{');

		try {
			process.chdir(temporaryDirectory);
			await expect(getStoredConfig(true)).resolves.toBeNull();
		} finally {
			process.chdir(originalDirectory);
		}

		expect(error).toHaveBeenCalled();
	});

	test('loads named exports from modules and JSON', async () => {
		const modulePath = join(temporaryDirectory, 'named.mjs');
		const jsonPath = join(temporaryDirectory, 'named.json');
		await Promise.all([
			writeFile(modulePath, "export const command = { name: 'module', description: 'Module command' };\n"),
			writeFile(jsonPath, JSON.stringify({ command: { name: 'json', description: 'JSON command' } })),
		]);

		const result = await getCommands([modulePath, jsonPath], false, false, 'command');

		expect(result.commands?.map(({ name }) => name)).toEqual(['module', 'json']);
	});

	test('loads a named export nested in a CommonJS default export', async () => {
		const commandPath = join(temporaryDirectory, 'nested.cjs');
		await writeFile(commandPath, "module.exports = { command: { name: 'nested', description: 'Nested command' } };\n");

		const result = await getCommands([commandPath], false, false, 'command');

		expect(result.commands?.[0]?.name).toBe('nested');
	});

	test('serializes command builders through toJSON', async () => {
		const commandPath = join(temporaryDirectory, 'builder.mjs');
		await writeFile(
			commandPath,
			"export default { toJSON() { return { name: 'builder', description: 'Builder command' }; } };\n",
		);

		const result = await getCommands([commandPath], false, false);

		expect(result.commands?.[0]).toMatchObject({ name: 'builder', description: 'Builder command', type: 1 });
	});

	test('loads JSON commands from non-string PathLike values', async () => {
		const commandPath = join(temporaryDirectory, 'buffer-path.json');
		await writeFile(commandPath, JSON.stringify({ name: 'buffer', description: 'Buffer path command' }));

		const result = await getCommands([Buffer.from(commandPath)], false, false);

		expect(result.commands?.[0]?.name).toBe('buffer');
	});

	test('ignores invalid and unsupported files in folders and logs debug details', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		await Promise.all([
			writeFile(join(temporaryDirectory, 'valid.json'), JSON.stringify({ name: 'valid', description: 'Valid' })),
			writeFile(join(temporaryDirectory, 'invalid.json'), '{'),
			writeFile(join(temporaryDirectory, 'ignored.txt'), 'not a command'),
		]);

		const result = await getCommands([temporaryDirectory], false, true);

		expect(result.commands?.map(({ name }) => name)).toEqual(['valid']);
		expect(log).toHaveBeenCalled();
	});

	test.each([
		[false, true],
		[true, false],
	])('applies path destinations while respecting global overrides', async (overrideGlobal, expectedGlobal) => {
		const commandPath = join(temporaryDirectory, `destination-${String(overrideGlobal)}.json`);
		await writeFile(commandPath, JSON.stringify({ name: 'destination', description: 'Destination command' }));

		const result = await getCommands(
			[
				{
					path: commandPath,
					destinations: { global: true, guildIds: ['345678901234567890'] },
				},
			],
			overrideGlobal,
			false,
		);

		expect(result.commands).toBeUndefined();
		expect(result.finalCommands).toEqual([
			{
				command: { name: 'destination', description: 'Destination command', type: 1 },
				global: expectedGlobal,
				guildIds: ['345678901234567890'],
			},
		]);
	});

	test('reports when no valid commands are found', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const commandPath = join(temporaryDirectory, 'invalid.json');
		await writeFile(commandPath, JSON.stringify({ unrelated: true }));

		const result = await getCommands([commandPath], false, true);

		expect(result).toEqual({ commands: undefined, error: true, finalCommands: undefined });
		expect(error).toHaveBeenCalledWith('Error No commands found in all specified directories!');
	});

	test.each([
		['primitive named export', 'json', JSON.stringify({ command: 'invalid' }), 'command'],
		['primitive module export', 'mjs', 'export default 42;\n', undefined],
	])('rejects a %s', async (_description, extension, source, named) => {
		const commandPath = join(temporaryDirectory, `invalid-command.${extension}`);
		await writeFile(commandPath, source);

		const result = await getCommands([commandPath], false, false, named);

		expect(result.error).toBe(true);
		expect(result.commands).toBeUndefined();
	});

	test('stores JavaScript configuration as ESM without secrets', async () => {
		const configPath = join(temporaryDirectory, 'stored-config.mjs');
		await expect(
			storeConfig(
				{
					clientId: '1234567890123456',
					debug: false,
					token: 'secret',
				},
				configPath,
			),
		).resolves.toBe(true);

		const storedSource = await readFile(configPath, 'utf8');
		expect(storedSource).toMatch(/^export default /);
		expect(storedSource).not.toContain('secret');

		const storedModule = (await import(pathToFileURL(configPath).href)) as {
			default: Record<string, unknown>;
		};
		expect(storedModule.default).toEqual({ clientId: '1234567890123456' });
	});

	test.each([
		['json', '{\n\t"clientId": "1234567890123456"\n}\n'],
		['cjs', 'module.exports = {\n\tclientId: "1234567890123456"\n};\n'],
	])('stores %s configuration', async (extension, expected) => {
		const configPath = join(temporaryDirectory, `stored-config.${extension}`);

		await expect(storeConfig({ clientId: '1234567890123456', developer: undefined }, configPath)).resolves.toBe(true);

		await expect(readFile(configPath, 'utf8')).resolves.toBe(expected);
	});

	test('removes derived destinations and definitions when storing path destination configuration', async () => {
		const configPath = join(temporaryDirectory, 'stored-paths.json');
		const commandPath = join(temporaryDirectory, 'commands');

		await storeConfig(
			{
				clientId: '1234567890123456',
				commandDefinitions: [{ name: 'test', description: 'Test command' }],
				commandDestinations: { global: [{ name: 'test' }] },
				commands: [{ path: commandPath, destinations: { global: true } }],
				token: 'secret',
			},
			configPath,
		);

		const stored = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
		expect(stored).not.toHaveProperty('commandDefinitions');
		expect(stored).not.toHaveProperty('commandDestinations');
		expect(stored).not.toHaveProperty('token');
		expect(stored).toHaveProperty('commands');
	});

	test('returns false and logs debug details when configuration cannot be stored', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		await expect(storeConfig({ debug: true }, temporaryDirectory)).resolves.toBe(false);
		expect(log).toHaveBeenCalledWith('Debug Error storing config', expect.any(Error));
	});
});
