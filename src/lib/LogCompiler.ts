import chalk from 'chalk';
import { ApplicationCommandType, Snowflake } from 'discord-api-types/v10';
import { table } from 'table';
import type { DeployResponse, SingleDeployResponse } from './Deploy';

const TypeNames = {
	[ApplicationCommandType.ChatInput]: 'Chat Input',
	[ApplicationCommandType.User]: 'User',
	[ApplicationCommandType.Message]: 'Message',
};

function outputFull(guildId: Snowflake | 'global', data: SingleDeployResponse, dry: boolean): void {
	if (data.bulkError) {
		console.log(chalk`Deploy to ${guildId} {redBright failed}: ${data.bulkError.message}`);
		return;
	}
	let header = chalk`Deploy to ${guildId} {greenBright successful}`;
	if (data.errored.length) {
		header = chalk`Deploy to ${guildId} {yellow partially successful}`;
	}
	let outputData: string[][];
	if (dry) {
		outputData = [['Type', 'Name', 'Status']];
		for (const skipped of data.skipped) {
			outputData.push([
				TypeNames[skipped.command.type ?? ApplicationCommandType.ChatInput],
				skipped.name,
				chalk`{yellow Skipped} (Dry Run)`,
			]);
		}
	} else {
		outputData = [['Type', 'Name', 'ID', 'Version', 'Status']];
		for (const command of data.commands) {
			outputData.push([
				TypeNames[command.type],
				command.name,
				command.id,
				command.version,
				chalk.greenBright('Success'),
			]);
		}
		for (const skipped of data.skipped) {
			outputData.push([
				TypeNames[skipped.existing!.type],
				skipped.name,
				skipped.id!,
				skipped.existing!.version,
				chalk`{yellow Skipped} (Matched Existing)`,
			]);
		}
		for (const errored of data.errored) {
			outputData.push([
				TypeNames[errored.command.type ?? ApplicationCommandType.ChatInput],
				errored.name,
				'N/A',
				'N/A',
				chalk`{redBright Failed} (${errored.error.message})`,
			]);
		}
	}
	console.log(table(outputData, { columnDefault: { width: 30, wrapWord: true }, header: { content: header } }));
}

export default function outputResults(
	results: DeployResponse,
	debug: boolean,
	dryRun: boolean,
	full: boolean,
	disableSummary: boolean,
): void {
	if (results.error) {
		console.log(chalk.redBright('Deployment Failed:'), debug ? results.error : results.error.message);
		return;
	}
	if (!results.global && results.guilds.size === 0) {
		console.log(chalk.cyanBright('No Commmands Deployed'));
		return;
	}
	if (results.dev) {
		outputFull(results.dev, results.guilds.get(results.dev)!, dryRun);
		return;
	}
	if (debug || dryRun || full) {
		if (results.global) {
			outputFull('global', results.global, dryRun);
		}
		for (const [id, data] of results.guilds) {
			outputFull(id, data, dryRun);
		}
		return;
	}
	if (disableSummary) {
		let failed = true;
		let success = true;
		if (results.global?.commands.length || results.global?.skipped.length) {
			failed = false;
			if (results.global.errored.length) success = false;
		}
		if (failed || success) {
			for (const data of results.guilds.values()) {
				if (data.commands.length || data.skipped.length) failed = false;
				if (data.errored.length) success = true;
				if (!failed && !success) break;
			}
		}
		let status = chalk.yellow('Partially Successful');
		if (success) status = chalk.greenBright('Successful');
		if (failed) status = chalk.redBright('Failed');
		console.log(`Deploy Completed: ${status}`);
		return;
	}
	const outputData = [['Destination', 'Successful', 'Skipped', 'Errored']];
	if (results.global) {
		outputData.push([
			'Global',
			chalk.greenBright(results.global.commands.length),
			chalk.yellow(results.global.skipped.length),
			results.global.bulkError
				? chalk`{redBright All} (${results.global.bulkError.message})`
				: chalk.redBright(results.global.errored.length),
		]);
	}
	for (const [id, data] of results.guilds) {
		outputData.push([
			`Guild (${id})`,
			chalk.greenBright(data.commands.length),
			chalk.yellow(data.skipped.length),
			data.bulkError ? chalk`{redBright All} (${data.bulkError.message})` : chalk.redBright(data.errored.length),
		]);
	}
	console.log(table(outputData, { columnDefault: { width: 30, wrapWord: true }, header: { content: 'Summary' } }));
}
