#!/usr/bin/env node
/**
 * Reads a UTF-8, comma-delimited CSV (with header), increments a counter
 * starting at 1 for each data row, converts the counter into a 6-character
 * uppercase ID (excluding 'I' and 'O'), overwrites the existing 'char_id'
 * column with the generated ID (skipping any IDs containing banned words),
 * and writes the result to a default output file derived from the input name.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 24 allowed characters: A-Z excluding 'I' and 'O'
const CHARSET = 'MTQHWZKJYVRGASNBPFUCLDEX';
const BASE = CHARSET.length; // 24
const ID_LENGTH = 6;
const MAX_ID = BASE ** ID_LENGTH; // 24^6 = 191,102,976 (>= 150,000,000)

// Banned substrings (common English swear words) to skip in IDs.
const BANNED_SUBSTRINGS = [
  'FUCK', 'SHT', 'CUNT', 'GAY', 'ASS', 'ASSHLE', 'SLUT', 'DAMN', 'VULVA', 'WANK', 'SPUNK', 'SMUT', 'SEX', 'SCAT', 'SEMEN', 'RAPE', 'PANTY', 'NSFW', 'NGGER', 'JUGGS',
  'HELL', 'CRAP', 'FAG', 'PUSSY', 'TWAT', 'WANKER', 'BTCH', 'RETARD', 'TRANNY', 'JESUS', 'FELCH', 'FAG', 'FECAL', 'EUNUCH', 'CUM', 'BUTT', 'BUKKAKE', 'BREAST', 'ANUS', 'ANAL',
];
// Note: Some listed words contain 'I' or 'O' (which are not in CHARSET), so they
// cannot actually appear in any generated ID. They are included for completeness.

/**
 * Convert a positive integer (1..24^6) into a 6-character ID using the
 * allowed character set.
 */
function numberToCharId(n) {
  if (n < 1 || n > MAX_ID) {
    throw new RangeError(
      `Counter ${n} is out of range for a 6-char ID (allowed: 1..${MAX_ID}).`
    );
  }
  let value = n - 1; // zero-based
  const chars = new Array(ID_LENGTH).fill('A');
  for (let i = ID_LENGTH - 1; i >= 0; i--) {
    const rem = value % BASE;
    value = Math.floor(value / BASE);
    chars[i] = CHARSET[rem];
  }
  return chars.join('');
}

/** Return true if idStr contains any banned word substring. */
function containsBannedSubstring(idStr) {
  const s = idStr.toUpperCase();
  return BANNED_SUBSTRINGS.some((bad) => s.includes(bad));
}

/** Derive a default output path from the input path. */
function defaultOutputPath(inputPath) {
  const ext = path.extname(inputPath);
  const root = ext ? inputPath.slice(0, -ext.length) : inputPath;
  return `${root}_with_char_id${ext || '.csv'}`;
}

/** Minimal RFC 4180 CSV parser (handles quoted fields, embedded commas/quotes/newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvField(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatCsvRow(fields) {
  return `${fields.map(csvField).join(',')}\r\n`;
}

/**
 * Populate the existing char_id column with generated IDs (skipping banned IDs)
 * and write the full rows to outputPath. Returns the number of data rows written.
 */
function processCsv(inputPath, outputPath, start = 1) {
  const text = fs.readFileSync(inputPath, 'utf8');
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new Error('Input CSV has no header row.');
  }
  const header = rows[0];
  const charIdIndex = header.indexOf('char_id');
  if (charIdIndex === -1) {
    throw new Error("Input CSV does not contain a 'char_id' column.");
  }

  const out = [formatCsvRow(header)];
  let counter = start;
  let rowsWritten = 0;

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r].slice();
    let charId = numberToCharId(counter);
    while (containsBannedSubstring(charId)) {
      counter += 1;
      if (counter > MAX_ID) {
        throw new Error('Ran out of valid IDs to assign (all were filtered).');
      }
      charId = numberToCharId(counter);
    }
    while (row.length < header.length) row.push('');
    row[charIdIndex] = charId;
    out.push(formatCsvRow(row));
    rowsWritten += 1;
    counter += 1; // move to the next number for the next row
  }

  fs.writeFileSync(outputPath, out.join(''), 'utf8');
  return rowsWritten;
}

function printUsage() {
  process.stdout.write(
    [
      'usage: makeCharID.js [-h] [-o OUTPUT] input',
      '',
      'Fill the char_id column of a CSV with generated 6-char IDs (skipping profane IDs).',
      '',
      'positional arguments:',
      '  input                 Path to the input CSV file.',
      '',
      'options:',
      '  -h, --help            show this help message and exit',
      '  -o OUTPUT, --output OUTPUT',
      '                        Path to the output CSV file (default: <input>_with_char_id.csv).',
      '',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const args = { input: null, output: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (a === '-o' || a === '--output') {
      i += 1;
      args.output = argv[i];
    } else if (args.input === null) {
      args.input = a;
    }
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }
  if (!args.input) {
    printUsage();
    return 2;
  }
  const outputPath = args.output || defaultOutputPath(args.input);
  const rows = processCsv(args.input, outputPath);
  console.log(`Wrote ${rows} rows to ${outputPath}`);
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  CHARSET,
  BASE,
  ID_LENGTH,
  MAX_ID,
  BANNED_SUBSTRINGS,
  numberToCharId,
  containsBannedSubstring,
  defaultOutputPath,
  parseCsv,
  processCsv,
  main,
};
