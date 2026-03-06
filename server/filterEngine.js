function applyFilters(cases, filters) {
  if (!filters || !Array.isArray(filters) || filters.length === 0) {
    return cases;
  }

  return cases.filter(row => {
    return filters.every(filter => {
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

module.exports = { applyFilters };
