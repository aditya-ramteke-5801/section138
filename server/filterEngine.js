// Validate and fix filter field names against actual column names
function validateFilters(filters, columnNames) {
  if (!filters || !Array.isArray(filters)) return [];

  const COLUMN_ALIASES = {
    'prior_contact': 'Call Sent count',
    'contact_attempts': 'Call Sent count',
    'call_attempts': 'Call Sent count',
    'calls_made': 'Call Sent count',
    'case_rank': null,
    'rank': null,
    'outstanding_amount': 'Amount Pending',
    'amount_outstanding': 'Amount Pending',
    'principal_outstanding': 'Amount Pending',
    'pos': 'Amount Pending',
    'dpd_days': 'DPD',
    'days_past_due': 'DPD',
    'borrower_name': 'Name',
    'borrower_state': 'State',
    'borrower_city': 'City',
    'last_disposition': 'Latest Disposition',
    'disposition': 'Latest Disposition',
    'cibil_score': 'CIBIL Score',
    'marital_status': 'Marital State',
    'enach': 'E-Nach Enabled',
    'e_nach': 'E-Nach Enabled',
    'pin_code': 'Pin Code',
    'pincode': 'Pin Code',
    'loan_number': 'Loan Number',
    'primary_address': 'Primary Address',
    'interest_rate': 'Interest Rate',
    'customer_language': 'Customer Language',
    'due_date': 'Due Date',
  };

  const colSet = new Set(columnNames);

  return filters.filter(f => {
    // Already valid
    if (colSet.has(f.field)) return true;

    // Try alias lookup (case-insensitive, underscore-normalized)
    const normalized = f.field.toLowerCase().replace(/\s+/g, '_');
    if (COLUMN_ALIASES[normalized] !== undefined) {
      if (COLUMN_ALIASES[normalized] === null) {
        console.warn(`Filter dropped: "${f.field}" has no valid column equivalent`);
        return false;
      }
      console.warn(`Filter field corrected: "${f.field}" → "${COLUMN_ALIASES[normalized]}"`);
      f.field = COLUMN_ALIASES[normalized];
      return true;
    }

    // Try case-insensitive match against actual columns
    const match = columnNames.find(c => c.toLowerCase() === f.field.toLowerCase());
    if (match) {
      console.warn(`Filter field corrected (case): "${f.field}" → "${match}"`);
      f.field = match;
      return true;
    }

    console.warn(`Filter dropped: "${f.field}" is not a valid column`);
    return false;
  });
}

// Data-aware filter correction: fix operators and values based on actual data
function correctFiltersWithData(filters, cases) {
  if (!filters || !Array.isArray(filters) || cases.length === 0) return filters;

  return filters.map(f => {
    const { field, operator, value } = f;

    // Collect column stats for this field
    const values = cases.map(r => (r[field] || '').toString().trim());
    const nonEmpty = values.filter(v => v !== '');
    const emptyCount = values.length - nonEmpty.length;
    const fillRate = nonEmpty.length / values.length;

    // Check if column is numeric (majority of non-empty values parse as numbers)
    const numericValues = nonEmpty.map(v => parseFloat(v)).filter(v => !isNaN(v));
    const isNumeric = numericValues.length > nonEmpty.length * 0.8;

    // --- FIX 1: is_empty on a nearly-full column ---
    // If LLM says is_empty but <5% of rows are actually empty, it likely means "equals 0" for numeric columns
    if (operator === 'is_empty' && fillRate > 0.95) {
      if (isNumeric) {
        console.warn(`Filter corrected: "${field}" is_empty → equals 0 (column is ${Math.round(fillRate * 100)}% filled, numeric)`);
        return { ...f, operator: 'equals', value: '0' };
      }
      // For non-numeric, is_empty on a full column is likely a bad filter — but keep it as-is
      console.warn(`Warning: "${field}" is_empty but column is ${Math.round(fillRate * 100)}% filled`);
    }

    // --- FIX 2: is_not_empty on a nearly-full column → useless filter, drop it ---
    if (operator === 'is_not_empty' && fillRate > 0.95) {
      console.warn(`Filter dropped: "${field}" is_not_empty is redundant (column is ${Math.round(fillRate * 100)}% filled)`);
      return null;
    }

    // --- FIX 3: equals with wrong case for categorical columns ---
    if ((operator === 'equals' || operator === 'not_equals') && !isNumeric && value) {
      const valLower = value.toString().toLowerCase();
      // Find exact match in actual data values
      const uniqueVals = [...new Set(nonEmpty)];
      const exactMatch = uniqueVals.find(v => v.toLowerCase() === valLower);
      if (exactMatch && exactMatch !== value.toString()) {
        console.warn(`Filter value corrected: "${value}" → "${exactMatch}" for "${field}"`);
        return { ...f, value: exactMatch };
      }
    }

    // --- FIX 4: "in" operator with wrong case values ---
    if ((operator === 'in' || operator === 'not_in') && Array.isArray(value)) {
      const uniqueVals = [...new Set(nonEmpty)];
      const correctedValues = value.map(v => {
        const vLower = v.toString().toLowerCase();
        const match = uniqueVals.find(uv => uv.toLowerCase() === vLower);
        return match || v;
      });
      return { ...f, value: correctedValues };
    }

    // --- FIX 5: Numeric operator on a non-numeric column → likely wrong filter ---
    const numericOps = ['greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'between'];
    if (numericOps.includes(operator) && !isNumeric && nonEmpty.length > 0) {
      console.warn(`Warning: numeric operator "${operator}" on non-numeric column "${field}"`);
    }

    return f;
  }).filter(f => f !== null);
}

function applyFilters(cases, filters) {
  if (!filters || !Array.isArray(filters) || filters.length === 0) {
    return cases;
  }

  // Auto-correct filters based on actual data before applying
  const correctedFilters = correctFiltersWithData(filters, cases);

  return cases.filter(row => {
    return correctedFilters.every(filter => {
      const { field, operator, value } = filter;
      const cellValue = row[field];

      if (cellValue === undefined || cellValue === null) return false;

      const cell = cellValue.toString().trim();

      // Skip empty cells for numeric operators instead of rejecting
      const numericOps = ['greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'between'];
      if (cell === '' && numericOps.includes(operator)) return false;

      const cellNum = parseFloat(cell);

      switch (operator) {
        case 'equals':
          return cell.toLowerCase() === value.toString().toLowerCase();

        case 'not_equals':
          return cell.toLowerCase() !== value.toString().toLowerCase();

        case 'contains':
          return cell.toLowerCase().includes(value.toString().toLowerCase());

        case 'not_contains':
          return !cell.toLowerCase().includes(value.toString().toLowerCase());

        case 'greater_than':
          return !isNaN(cellNum) && cellNum > parseFloat(value);

        case 'less_than':
          return !isNaN(cellNum) && cellNum < parseFloat(value);

        case 'greater_than_or_equal':
          return !isNaN(cellNum) && cellNum >= parseFloat(value);

        case 'less_than_or_equal':
          return !isNaN(cellNum) && cellNum <= parseFloat(value);

        case 'between':
          if (!isNaN(cellNum) && value.min !== undefined && value.max !== undefined) {
            return cellNum >= parseFloat(value.min) && cellNum <= parseFloat(value.max);
          }
          return false;

        case 'in':
          if (Array.isArray(value)) {
            return value.some(v => cell.toLowerCase() === v.toString().toLowerCase());
          }
          return false;

        case 'not_in':
          if (Array.isArray(value)) {
            return !value.some(v => cell.toLowerCase() === v.toString().toLowerCase());
          }
          return true;

        case 'is_empty':
          return cell === '';

        case 'is_not_empty':
          return cell !== '';

        case 'regex':
          try {
            return new RegExp(value, 'i').test(cell);
          } catch {
            return false;
          }

        default:
          return true;
      }
    });
  });
}

module.exports = { applyFilters, validateFilters };
