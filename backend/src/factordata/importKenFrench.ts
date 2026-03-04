import { promises as fs } from 'node:fs';
import path from 'node:path';

import '../lib/env';
import { upsertFactorReturns, type StoredFactorRow } from '../db/factorDataRepository';

type RowPatch = {
  marketExcess?: number | null;
  smb?: number | null;
  hml?: number | null;
  momentum?: number | null;
  rmw?: number | null;
  cma?: number | null;
  riskFree?: number | null;
};

type FactorAccumulator = {
  period: string;
  marketExcess: number | null;
  smb: number | null;
  hml: number | null;
  momentum: number | null;
  rmw: number | null;
  cma: number | null;
  riskFree: number | null;
};

type DatasetDefinition = {
  factorSet: string;
  files: string[];
};

const datasetDefinitions: DatasetDefinition[] = [
  {
    factorSet: 'us_ff4_monthly',
    files: [
      'F-F_Research_Data_Factors.csv',
      'F-F_Momentum_Factor.csv',
    ],
  },
  {
    factorSet: 'us_ff6_daily',
    files: [
      'F-F_Research_Data_5_Factors_2x3_daily.csv',
      'F-F_Momentum_Factor_daily.csv',
    ],
  },
  {
    factorSet: 'us_ff3_weekly',
    files: [
      'F-F_Research_Data_Factors_weekly.csv',
    ],
  },
];

const supportedFiles = new Set(datasetDefinitions.flatMap((definition) => definition.files));

function getFactorDirectory(): string {
  return path.resolve(__dirname, '../../../factordata');
}

function getManifestPath(): string {
  return path.join(getFactorDirectory(), 'expected-files.txt');
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizePeriod(rawPeriod: string): string | null {
  const value = rawPeriod.trim();

  if (/^\d{6}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-01`;
  }

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  return null;
}

function parseValue(rawValue: string | undefined): number | null {
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue.trim());

  if (!Number.isFinite(value) || value <= -99) {
    return null;
  }

  return round(value);
}

function createAccumulator(period: string): FactorAccumulator {
  return {
    period,
    marketExcess: null,
    smb: null,
    hml: null,
    momentum: null,
    rmw: null,
    cma: null,
    riskFree: null,
  };
}

export function parseExpectedFilesList(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export function parseCsvFileContents(contents: string): Array<{ period: string; values: Record<string, number | null> }> {
  const normalizedContents = contents.replace(/^\uFEFF/, '');
  const lines = normalizedContents.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith(','));

  if (headerIndex === -1) {
    throw new Error('Unable to locate factor header row.');
  }

  const headers = lines[headerIndex]?.split(',').map((column) => column.trim()) ?? [];
  const rows: Array<{ period: string; values: Record<string, number | null> }> = [];

  for (let lineIndex = headerIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]?.trimEnd() ?? '';

    if (!line.trim()) {
      break;
    }

    const columns = line.split(',').map((column) => column.trim());
    const period = normalizePeriod(columns[0] ?? '');

    if (!period) {
      break;
    }

    const values: Record<string, number | null> = {};

    for (let index = 1; index < headers.length; index += 1) {
      const header = headers[index];

      if (!header) {
        continue;
      }

      values[header] = parseValue(columns[index]);
    }

    rows.push({ period, values });
  }

  return rows;
}

function toPatch(values: Record<string, number | null>): RowPatch {
  return {
    marketExcess: values['Mkt-RF'] ?? null,
    smb: values.SMB ?? null,
    hml: values.HML ?? null,
    momentum: values.Mom ?? values.MOM ?? null,
    rmw: values.RMW ?? null,
    cma: values.CMA ?? null,
    riskFree: values.RF ?? null,
  };
}

function mergeDatasetRows(rowsByPeriod: Map<string, FactorAccumulator>, rows: Array<{ period: string; values: Record<string, number | null> }>): void {
  for (const row of rows) {
    const accumulator = rowsByPeriod.get(row.period) ?? createAccumulator(row.period);
    const patch = toPatch(row.values);

    accumulator.marketExcess = patch.marketExcess ?? accumulator.marketExcess;
    accumulator.smb = patch.smb ?? accumulator.smb;
    accumulator.hml = patch.hml ?? accumulator.hml;
    accumulator.momentum = patch.momentum ?? accumulator.momentum;
    accumulator.rmw = patch.rmw ?? accumulator.rmw;
    accumulator.cma = patch.cma ?? accumulator.cma;
    accumulator.riskFree = patch.riskFree ?? accumulator.riskFree;

    rowsByPeriod.set(row.period, accumulator);
  }
}

function finalizeDatasetRows(factorSet: string, rowsByPeriod: Map<string, FactorAccumulator>): StoredFactorRow[] {
  return [...rowsByPeriod.values()]
    .filter((row) => row.marketExcess !== null && row.riskFree !== null)
    .sort((left, right) => left.period.localeCompare(right.period))
    .map((row) => ({
      factorSet,
      period: row.period,
      marketExcess: row.marketExcess ?? 0,
      smb: row.smb,
      hml: row.hml,
      momentum: row.momentum,
      rmw: row.rmw,
      cma: row.cma,
      riskFree: row.riskFree ?? 0,
    }));
}

async function readExpectedFiles(): Promise<string[]> {
  const manifestContents = await fs.readFile(getManifestPath(), 'utf8');
  return parseExpectedFilesList(manifestContents);
}

async function ensureExpectedFilesExist(expectedFiles: string[]): Promise<void> {
  for (const fileName of expectedFiles) {
    if (!supportedFiles.has(fileName)) {
      throw new Error(`Unsupported factor file in expected-files.txt: ${fileName}`);
    }

    const filePath = path.join(getFactorDirectory(), fileName);
    await fs.access(filePath);
  }
}

async function importDataset(definition: DatasetDefinition): Promise<number> {
  const rowsByPeriod = new Map<string, FactorAccumulator>();

  for (const fileName of definition.files) {
    const filePath = path.join(getFactorDirectory(), fileName);
    const contents = await fs.readFile(filePath, 'utf8');
    const parsedRows = parseCsvFileContents(contents);
    mergeDatasetRows(rowsByPeriod, parsedRows);
  }

  const finalizedRows = finalizeDatasetRows(definition.factorSet, rowsByPeriod);
  await upsertFactorReturns(finalizedRows);
  return finalizedRows.length;
}

export async function runKenFrenchImport(): Promise<void> {
  const expectedFiles = await readExpectedFiles();
  await ensureExpectedFilesExist(expectedFiles);

  console.log(`Importing Ken French factor data from ${expectedFiles.length} expected files.`);

  for (const definition of datasetDefinitions) {
    const missingFiles = definition.files.filter((fileName) => !expectedFiles.includes(fileName));

    if (missingFiles.length > 0) {
      throw new Error(`Missing expected file entries for ${definition.factorSet}: ${missingFiles.join(', ')}`);
    }

    const importedRowCount = await importDataset(definition);
    console.log(`Imported ${importedRowCount} rows into ${definition.factorSet}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runKenFrenchImport()
    .catch((error) => {
      console.error('Ken French factor import failed.');
      console.error(error);
      process.exit(1);
    });
}
