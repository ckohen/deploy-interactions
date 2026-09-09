import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { getCommands, getStoredConfig, storeConfig } from '../src/lib/FileParser.js';

describe('asynchronous file parsing', () => {
	let temporaryDirectory: string;

	beforeEach(async () => {
		temporaryDirectory = await mkdtemp(join(tmpdir(), 'deploy-interactions-'));
	});

	afterEach(async () => {
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
});
