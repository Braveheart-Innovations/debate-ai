/** Moved from symposium-ai-web src/services/file-parser.ts (Phase 3 Step 5), logic unchanged; the sandbox filesystem is injected. */
/**
 * File Parser Service
 *
 * Client-side file parsing for the read_file tool.
 * Reads files from the Python sandbox filesystem (/uploads/, /output/, /data/) and parses them
 * based on format (CSV, Excel, JSON, text) with automatic format detection.
 *
 * Uses:
 * - PapaParse for CSV parsing with encoding detection
 * - SheetJS (xlsx) for Excel file parsing
 * - Native JSON.parse for JSON files
 */

import type { ReadFileResult } from '../../contract/lib/ai/tools/built-in/read-file';
import type { SandboxFiles } from './sandboxFiles';

const DEFAULT_TEXT_PREVIEW_CHARS = 4000;
const MAX_TEXT_PREVIEW_CHARS = 5000;

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect file format from extension.
 */
function detectFormat(path: string): 'csv' | 'json' | 'excel' | 'text' {
  const ext = path.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'csv':
    case 'tsv':
      return 'csv';
    case 'json':
    case 'jsonl':
      return 'json';
    case 'xlsx':
    case 'xls':
    case 'xlsb':
      return 'excel';
    default:
      return 'text';
  }
}

/**
 * Infer column types from data.
 */
function inferColumnTypes(data: Record<string, unknown>[]): Record<string, string> {
  const types: Record<string, string> = {};

  if (data.length === 0) return types;

  const sampleSize = Math.min(data.length, 100);
  const columns = Object.keys(data[0]);

  for (const col of columns) {
    const values = data.slice(0, sampleSize).map(row => row[col]).filter(v => v != null && v !== '');

    if (values.length === 0) {
      types[col] = 'empty';
      continue;
    }

    // Check if all values are numbers
    const allNumbers = values.every(v => {
      if (typeof v === 'number') return true;
      if (typeof v === 'string') {
        const num = Number(v);
        return !isNaN(num) && v.trim() !== '';
      }
      return false;
    });

    if (allNumbers) {
      // Check if integer or float
      const allIntegers = values.every(v => {
        const num = Number(v);
        return Number.isInteger(num);
      });
      types[col] = allIntegers ? 'integer' : 'float';
      continue;
    }

    // Check if all values are booleans
    const allBooleans = values.every(v => {
      if (typeof v === 'boolean') return true;
      if (typeof v === 'string') {
        const lower = v.toLowerCase();
        return ['true', 'false', 'yes', 'no', '1', '0'].includes(lower);
      }
      return false;
    });

    if (allBooleans) {
      types[col] = 'boolean';
      continue;
    }

    // Check if all values look like dates
    const allDates = values.every(v => {
      if (typeof v !== 'string') return false;
      const date = new Date(v);
      return !isNaN(date.getTime()) && v.length >= 8;
    });

    if (allDates) {
      types[col] = 'date';
      continue;
    }

    types[col] = 'string';
  }

  return types;
}

function normalizePreviewRange(
  content: string,
  offset = 0,
  maxChars = DEFAULT_TEXT_PREVIEW_CHARS
): Pick<ReadFileResult, 'content' | 'contentOffset' | 'contentEnd' | 'totalChars' | 'truncated'> {
  const safeOffset = Number.isFinite(offset)
    ? Math.min(Math.max(Math.floor(offset), 0), content.length)
    : 0;
  const safeMaxChars = Number.isFinite(maxChars)
    ? Math.min(Math.max(Math.floor(maxChars), 1), MAX_TEXT_PREVIEW_CHARS)
    : DEFAULT_TEXT_PREVIEW_CHARS;
  const contentEnd = Math.min(content.length, safeOffset + safeMaxChars);

  return {
    content: content.slice(safeOffset, contentEnd),
    contentOffset: safeOffset,
    contentEnd,
    totalChars: content.length,
    truncated: safeOffset > 0 || contentEnd < content.length,
  };
}

// ============================================================================
// CSV Parsing
// ============================================================================

async function parseCSV(
  content: string,
  maxRows: number,
  sample: boolean
): Promise<ReadFileResult> {
  // Dynamic import of PapaParse
  const Papa = (await import('papaparse')).default;

  const parsed = Papa.parse(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const allData = parsed.data as Record<string, unknown>[];
  const totalRows = allData.length;
  const columns = parsed.meta.fields || [];

  // Select rows: sample or first N
  let selectedData: Record<string, unknown>[];
  let sampled = false;

  if (sample && totalRows > maxRows) {
    // Fisher-Yates shuffle for random sample
    const indices = Array.from({ length: totalRows }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    selectedData = indices.slice(0, maxRows).sort((a, b) => a - b).map(i => allData[i]);
    sampled = true;
  } else {
    selectedData = allData.slice(0, maxRows);
  }

  const columnTypes = inferColumnTypes(selectedData);

  return {
    format: 'csv',
    filename: '',
    totalRows,
    returnedRows: selectedData.length,
    columns,
    columnTypes,
    data: selectedData,
    truncated: totalRows > maxRows,
    sampled,
  };
}

// ============================================================================
// Excel Parsing
// ============================================================================

async function parseExcel(
  data: ArrayBuffer,
  sheetName: string | undefined,
  maxRows: number
): Promise<ReadFileResult> {
  const XLSX = await import('xlsx');

  const workbook = XLSX.read(data, { type: 'array' });
  const sheets = workbook.SheetNames;

  // Select sheet
  const activeSheet = sheetName && sheets.includes(sheetName)
    ? sheetName
    : sheets[0];

  const worksheet = workbook.Sheets[activeSheet];
  if (!worksheet) {
    return {
      format: 'excel',
      filename: '',
      sheets,
      activeSheet,
      content: 'Sheet is empty or not found',
    };
  }

  // Convert to JSON
  const allData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
  const totalRows = allData.length;

  // Get column headers
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const columns: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    columns.push(cell ? String(cell.v) : `Column${c + 1}`);
  }

  const selectedData = allData.slice(0, maxRows);
  const columnTypes = inferColumnTypes(selectedData);

  return {
    format: 'excel',
    filename: '',
    totalRows,
    returnedRows: selectedData.length,
    columns,
    columnTypes,
    data: selectedData,
    sheets,
    activeSheet,
    truncated: totalRows > maxRows,
  };
}

// ============================================================================
// JSON Parsing
// ============================================================================

function parseJSON(
  content: string,
  maxRows: number,
  offset: number,
  maxChars: number
): ReadFileResult {
  const parsed = JSON.parse(content);
  const contentPreview = normalizePreviewRange(JSON.stringify(parsed, null, 2), offset, maxChars);

  if (Array.isArray(parsed)) {
    // JSON array - treat as tabular if objects
    const isTabular = parsed.length > 0 && typeof parsed[0] === 'object' && !Array.isArray(parsed[0]);

    if (isTabular) {
      const selectedData = parsed.slice(0, maxRows) as Record<string, unknown>[];
      const columns = Object.keys(parsed[0]);
      const columnTypes = inferColumnTypes(selectedData);

      return {
        format: 'json',
        filename: '',
        jsonType: 'array',
        jsonArrayLength: parsed.length,
        totalRows: parsed.length,
        returnedRows: selectedData.length,
        columns,
        columnTypes,
        data: selectedData,
        ...contentPreview,
        truncated: parsed.length > maxRows || contentPreview.truncated,
      };
    }

    // Non-tabular array
    return {
      format: 'json',
      filename: '',
      jsonType: 'array',
      jsonArrayLength: parsed.length,
      ...contentPreview,
    };
  }

  // JSON object
  const keys = Object.keys(parsed);

  return {
    format: 'json',
    filename: '',
    jsonType: 'object',
    jsonKeys: keys,
    ...contentPreview,
  };
}

// ============================================================================
// Text Parsing
// ============================================================================

function parseText(content: string, offset: number, maxChars: number): ReadFileResult {
  const lines = content.split('\n');
  const contentPreview = normalizePreviewRange(content, offset, maxChars);

  return {
    format: 'text',
    filename: '',
    lineCount: lines.length,
    fileSize: content.length,
    ...contentPreview,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Parse a file from the Python sandbox filesystem.
 *
 * @param path - File path (e.g., /uploads/data.csv or /output/report.html)
 * @param options - Parsing options
 * @returns Parsed file result
 */
export async function parseFile(
  files: SandboxFiles,
  path: string,
  options: {
    format?: 'auto' | 'csv' | 'json' | 'excel' | 'text';
    sheet?: string;
    maxRows?: number;
    sample?: boolean;
    offset?: number;
    maxChars?: number;
  } = {}
): Promise<ReadFileResult> {
  const {
    format = 'auto',
    sheet,
    maxRows = 1000,
    sample = false,
    offset = 0,
    maxChars = DEFAULT_TEXT_PREVIEW_CHARS,
  } = options;

  const filename = path.split('/').pop() || path;
  const detectedFormat = format === 'auto' ? detectFormat(path) : format;

  // Read file from the Python sandbox filesystem as ArrayBuffer
  let rawData: ArrayBuffer;

  try {
    rawData = await files.readFile(path);
  } catch (error) {
    throw new Error(
      `Cannot read file "${path}". ` +
      (error instanceof Error ? error.message : 'File not found or not accessible.')
    );
  }

  // For text-based formats, decode ArrayBuffer to string
  let fileData: ArrayBuffer | string;
  if (detectedFormat === 'excel') {
    fileData = rawData;
  } else {
    const decoder = new TextDecoder('utf-8');
    fileData = decoder.decode(rawData);
  }

  let result: ReadFileResult;

  switch (detectedFormat) {
    case 'csv':
      result = await parseCSV(fileData as string, maxRows, sample);
      break;
    case 'excel':
      result = await parseExcel(fileData as ArrayBuffer, sheet, maxRows);
      break;
    case 'json':
      result = parseJSON(fileData as string, maxRows, offset, maxChars);
      break;
    case 'text':
    default:
      result = parseText(fileData as string, offset, maxChars);
      break;
  }

  // Set filename on result
  result.filename = filename;
  result.fileSize = typeof fileData === 'string' ? fileData.length : fileData.byteLength;

  return result;
}
