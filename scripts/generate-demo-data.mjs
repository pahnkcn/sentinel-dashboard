import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createSafeWorkbookProfile,
  DEFAULT_PROFILE,
  generateSyntheticDataset,
  readTrustedWorkbook,
} from './demo-data.mjs';

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function parseGenerateArgs(args) {
  const workbookPath = readOption(args, '--workbook');
  const useDefaultProfile = args.includes('--default-profile');
  if ((workbookPath ? 1 : 0) + (useDefaultProfile ? 1 : 0) !== 1) {
    throw new Error('Choose exactly one of --workbook <trusted.xlsx> or --default-profile');
  }
  const endDate = readOption(args, '--end-date');
  if (!endDate) throw new Error('--end-date YYYY-MM-DD is required');

  const studentCountText = readOption(args, '--students');
  return {
    workbookPath,
    useDefaultProfile,
    endDate,
    seed: readOption(args, '--seed') ?? 'sentinel-demo-v2',
    studentCount: studentCountText === undefined ? undefined : Number(studentCountText),
    outputPath: readOption(args, '--output') ?? '.generated/sentinel-demo.json',
    profileOutputPath: readOption(args, '--profile-output'),
  };
}

async function writeJson(outputPath, value) {
  const absolutePath = resolve(outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w',
    mode: 0o600,
  });
  return absolutePath;
}

async function generateDemoData(options) {
  const profile = options.useDefaultProfile
    ? DEFAULT_PROFILE
    : createSafeWorkbookProfile(await readTrustedWorkbook(options.workbookPath));
  const dataset = generateSyntheticDataset({
    profile,
    studentCount: options.studentCount ?? profile.sourceShape.studentCount,
    endDate: options.endDate,
    seed: options.seed,
  });
  const outputPath = await writeJson(options.outputPath, dataset);
  const profileOutputPath = options.profileOutputPath
    ? await writeJson(options.profileOutputPath, profile)
    : null;

  return {
    outputPath,
    profileOutputPath,
    counts: Object.fromEntries(
      Object.entries(dataset.streams).map(([stream, records]) => [stream, records.length]),
    ),
    qualityReport: profile.qualityReport ?? null,
  };
}

async function main(args = process.argv.slice(2)) {
  const result = await generateDemoData(parseGenerateArgs(args));
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export {
  generateDemoData,
  parseGenerateArgs,
  writeJson,
};
