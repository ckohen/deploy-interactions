import { defineConfig } from 'eslint/config';
import common from 'eslint-config-neon/common';
import node from 'eslint-config-neon/node';
import prettier from 'eslint-config-neon/prettier';
import typescript from 'eslint-config-neon/typescript';
import merge from 'lodash.merge';

const commonFiles = '{js,mjs,cjs,ts,mts,cts,jsx,tsx}';

const commonRuleset = merge(...common, { files: [`**/*${commonFiles}`] });
const nodeRuleset = merge(...node, { files: [`**/*${commonFiles}`] });
const typeScriptRuleset = merge(...typescript, {
	files: [`**/*${commonFiles}`],
	languageOptions: {
		parserOptions: {
			warnOnUnsupportedTypeScriptVersion: false,
			allowAutomaticSingleRunInference: true,
			project: ['tsconfig.eslint.json'],
		},
	},
	rules: {
		'@typescript-eslint/consistent-type-definitions': [2, 'interface'],
		'@typescript-eslint/method-signature-style': 0,
		'jsdoc/check-param-names': [2, { checkDestructured: false }],
		'jsdoc/no-multi-asterisks': [2, { allowWhitespace: true }],
		'n/shebang': [2, { convertPath: { 'src/**/*.ts': ['^src/(.+?)\\.ts$', 'dist/$1.js'] } }],
	},
	settings: {
		'import/resolver': {
			typescript: {
				project: ['tsconfig.eslint.json'],
			},
		},
	},
});

const prettierRuleset = merge(...prettier, {
	files: [`**/*${commonFiles}`],
});

export default defineConfig(
	{
		ignores: ['**/node_modules/', '.git/', '**/dist/', '**/coverage/', '**/.vitest/'],
	},
	commonRuleset,
	nodeRuleset,
	typeScriptRuleset,
	{
		files: ['**/*{ts,mts,cts,tsx}'],
		rules: { 'jsdoc/no-undefined-types': 0 },
	},
	{
		files: ['**/*{js,mjs,cjs,jsx}'],
		rules: { 'tsdoc/syntax': 0 },
	},
	{
		files: ['src/lib/FileParser.ts'],
		rules: { 'jsdoc/no-bad-blocks': 0 },
	},
	prettierRuleset,
);
