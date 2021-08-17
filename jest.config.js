/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
	testMatch: ['**/+(*.)+(spec|test).+(ts|js)?(x)'],
	testEnvironment: 'node',
	collectCoverage: true,
	coverageProvider: 'v8',
	coverageDirectory: 'coverage',
	coverageReporters: ['html', 'text', 'clover'],
	coverageThreshold: {
		global: {
			branches: 75,
			lines: 75,
			statements: 75,
		},
	},
	coveragePathIgnorePatterns: ['/node_modules/'],
};
