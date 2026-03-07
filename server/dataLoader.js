const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

let cases = [];
let columnNames = [];
let columnSamples = {};
let columnFillRates = {};

function loadCSV() {
  return new Promise((resolve, reject) => {
    const csvPath = path.join(__dirname, '..', '..', 'loan_data.csv');
    const rows = [];

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('headers', (headers) => {
        columnNames = [...new Set(headers)];
      })
      .on('data', (row) => {
        rows.push(row);
      })
      .on('end', () => {
        cases = rows;
        // Pre-compute sample values per column (up to 3 unique non-empty values)
        for (const col of columnNames) {
          const uniqueVals = new Set();
          for (const row of cases) {
            const val = row[col];
            if (val && val.trim() !== '') {
              uniqueVals.add(val.trim());
              if (uniqueVals.size >= 3) break;
            }
          }
          columnSamples[col] = [...uniqueVals];
        }
        // Compute fill rates so AI knows which columns have data
        for (const col of columnNames) {
          const nonEmpty = cases.filter(r => r[col] && r[col].trim() !== '').length;
          columnFillRates[col] = Math.round((nonEmpty / cases.length) * 100);
        }
        console.log(`Loaded ${cases.length} cases with ${columnNames.length} columns`);
        resolve();
      })
      .on('error', reject);
  });
}

function getAllCases() {
  return cases;
}

function getColumnNames() {
  return columnNames;
}

function getSampleValues(n = 3) {
  const result = {};
  for (const col of columnNames) {
    result[col] = columnSamples[col] || [];
  }
  return result;
}

function getColumnContext() {
  return columnNames
    .filter(col => columnFillRates[col] > 0) // Only columns with data
    .map(col => ({
      name: col,
      samples: (columnSamples[col] || []).slice(0, 3),
      fillRate: columnFillRates[col],
    }));
}

module.exports = { loadCSV, getAllCases, getColumnNames, getSampleValues, getColumnContext };
