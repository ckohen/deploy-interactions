import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		exclude: ['**/node_modules', '**/dist', '.idea', '.git', '.cache'],
		passWithNoTests: true,
		coverage: {
			enabled: true,
			reporter: ['text', 'lcov', 'cobertura'],
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: [
				// All ts files that only contain types
				'**/*.{interface,type,d}.ts',
				// All index files that *should* only contain exports from other files
				'**/index.{js,ts}',
			],
		},
	},
});
