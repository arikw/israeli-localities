import path from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream';
import fetch from 'node-fetch';
import { default as readXlsxFile, readSheetNames } from 'read-excel-file/node';

export const camelToSnakeCase = str => str
  .replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
  .replace(/\./g, '_');

export function flatten(data, keyTransformer = camelToSnakeCase, prefix = '') {
  const result = {};

  Object.entries(data).forEach(([key, value]) => {
    if (value.constructor.name === 'Object') {
      Object.assign(result, flatten(value, keyTransformer, `${prefix}${key}.`));
    } else {
      result[keyTransformer(`${prefix}${key}`)] = value;
    }
  });

  return result;
}

export function flattenKeys(data, prefix = '') {
  const result = [];

  Object.entries(data).forEach(([key, value]) => {
    if (value.constructor.name === 'Object') {
      result.push(...flattenKeys(value, `${prefix}${key}.`));
    } else {
      result.push(camelToSnakeCase(`${prefix}${key}`));
    }
  });

  return result;
}

function getHeadersRow(localities) {
  // const exampler = flatten(localities.find(locality => locality.id === 3000 /* ירושלים */));
  const headersRow = flattenKeys(localities.find(locality => locality.id === 3000 /* ירושלים */));
  for (const locality of localities) {
    for (const header of flattenKeys(locality)) {
      if (!headersRow.includes(header)) {
        headersRow.push(header);
      }
    }
  }
  return headersRow;
}

function escapeValueForCsv(value) {
  switch (value.constructor.name) {
    case 'String':
      return `"${value.replace(/"/g, '""')}"`;
    case 'Array':
      return `"${value.join(',').replace(/"/g, '""')}"`;
    default:
      return value;
  }
}

export function writeCsvFile(csvFilename, items) {
  
  const headersRow = getHeadersRow(items);
  const csvRows = [];
  for (const item of items) {
    const csvRow = Array(headersRow.length);
    for (const [header, value] of Object.entries(flatten(item))) {
      const escapedValue = escapeValueForCsv(value);
      csvRow[headersRow.findIndex(h => h === header)] = escapedValue;
    }
    csvRows.push(csvRow);
  }

  // https://stackoverflow.com/questions/45232464/node-js-generated-csv-file-is-displaying
  writeFileSync(csvFilename, '\ufeff' + [
    headersRow.join(','),
    ...csvRows.map(r => r.join(','))
  ].join('\r\n'),
  { encoding: 'utf8' });
}


async function downloadFile(url, destPath) {
  const pipelinePromise = promisify(pipeline);
  return await pipelinePromise((await fetch(url)).body, createWriteStream(destPath));
}

export function getAbsolutePath(relativePath) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, relativePath);
}

export async function fetchRemoteData({ url, filename, sheets }, targetDirPath) {

  // json exists in the cache?
  const jsonFilename = path.resolve(targetDirPath, filename + '.json');
  if (existsSync(jsonFilename)) {
    return JSON.parse(readFileSync(jsonFilename));
  }

  const excelFilename = path.resolve(targetDirPath, filename);
  // excel file never downloaded?
  if (!existsSync(excelFilename)) {
    // download and cache
    if (!existsSync(targetDirPath)) { mkdirSync(targetDirPath); }
    await downloadFile(url, excelFilename);
  }

  // parse the excel file
  const parsedData = await parseRawExcelFile(excelFilename, sheets);

  // cache the resulted json
  writeFileSync(jsonFilename, JSON.stringify(parsedData, null, '\t'));

  // return rows array
  return parsedData;
}


function transformExcelRows(rows, options) {

  const transformOptions = options?.transform;
  if (!transformOptions) {
    return rows;
  }

  if (transformOptions.skip) {
    return undefined;
  }

  let resultRows = rows;

  if (transformOptions.startRow > 1) {
    resultRows = resultRows.slice(transformOptions.startRow - 1);
  }

  if (transformOptions.columns) {
    resultRows.unshift(transformOptions.columns);
  }

  if (transformOptions.dragValuesForColumnIndices) {

    // remove column names row
    const columnNames = resultRows.shift();

    let previousRow;
    for (const rowIdx in resultRows) {
      const row = resultRows[parseInt(rowIdx)];
      for (const colIdx of transformOptions.dragValuesForColumnIndices) {
        if ((row[colIdx] === null) && previousRow) {
          row[colIdx] = previousRow[colIdx];
        }
      }
      previousRow = row;
    }

    // restore column names row
    resultRows.unshift(columnNames);
  }

  resultRows = resultRows
    // remove empty rows
    .filter(row => row.filter(column => column !== null).length > 0)
    // filter rows that don't have a value in the idColumn
    .filter(row => {
      if (transformOptions.idColumn) {
        return (row[transformOptions.idColumn - 1] !== null);
      }
      return true;
    });

  return resultRows;
}

async function parseExcelSheet(excelFileData, sheetId, sheetOptions) {
  console.log(`  Parsing sheet "${sheetId}"...`);
  const parsedXls = await readXlsxFile(excelFileData, {
    sheet: sheetId,
    map: sheetOptions?.map,
    transformData: rows => transformExcelRows(rows, sheetOptions)
  });
  const rows = parsedXls?.rows ?? parsedXls;
  const errors = parsedXls?.errors;
  if (errors?.length) {
    console.error(errors);
  }
  return rows;
}

async function parseRawExcelFile(excelFileData, sheets) {
  let result = null;
  if (Array.isArray(sheets)) {
    result = [];
    for (const [sheetId, sheetOptions] of sheets.entries()) {
      const parsedSheet = await parseExcelSheet(excelFileData, sheetId + 1, sheetOptions);
      if (sheets.length > 1) {
        result.push(parsedSheet);
      } else {
        result = parsedSheet;
      }
    }
  } else {
    result = {};
    const sheetNames = (await readSheetNames(excelFileData));
    for (const sheetName of sheetNames) {
      const sheetOptions = sheets?.[sheetName.trim()];
      result[sheetName.trim()] = await parseExcelSheet(excelFileData, sheetName, sheetOptions);
    }
  }

  return result;
}
