require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const { loadCSV, getAllCases, getColumnNames, getColumnContext } = require('./dataLoader');
const { applyFilters } = require('./filterEngine');
const {
  parseQueryAndGenerateQuestions, generateFilterObject,
  handleFollowUp, generateExplanation,
} = require('./openaiService');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// GET /api/columns
app.get('/api/columns', (req, res) => {
  res.json({ columns: getColumnNames() });
});

// POST /api/parse-query — initial query parsing
app.post('/api/parse-query', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const columnContext = getColumnContext();
    const result = await parseQueryAndGenerateQuestions(query, columnContext);
    res.json(result);
  } catch (err) {
    console.error('Parse query error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/run-query — apply filters after clarification
app.post('/api/run-query', async (req, res) => {
  try {
    const { filters: originalFilters, questions, answers } = req.body;

    const { filters: finalFilters } = await generateFilterObject(
      originalFilters, questions || [], answers || {}
    );

    const allCases = getAllCases();
    const filtered = applyFilters(allCases, finalFilters);
    const sampleStats = computeSampleStats(filtered);
    const explanation = await generateExplanation(
      finalFilters, filtered.length, allCases.length, sampleStats
    );

    res.json({
      cases: filtered,
      explanation,
      filters_applied: finalFilters,
      total_count: allCases.length,
      result_count: filtered.length,
    });
  } catch (err) {
    console.error('Run query error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/follow-up — handle follow-up chat messages
app.post('/api/follow-up', async (req, res) => {
  try {
    const { message, currentFilters } = req.body;
    const allCases = getAllCases();
    const currentResults = applyFilters(allCases, currentFilters || []);

    const result = await handleFollowUp(
      message, currentFilters || [], currentResults.length, getColumnNames()
    );

    if (result.type === 'breakdown') {
      const breakdown = computeBreakdown(currentResults, result.field);
      res.json({ ...result, breakdown });
    } else if (result.type === 'filter' && result.action === 'add') {
      const newFilters = [...(currentFilters || []), ...(result.filters || [])];
      const filtered = applyFilters(allCases, newFilters);
      const sampleStats = computeSampleStats(filtered);
      const explanation = await generateExplanation(
        newFilters, filtered.length, allCases.length, sampleStats
      );
      res.json({
        ...result,
        cases: filtered,
        filters_applied: newFilters,
        total_count: allCases.length,
        result_count: filtered.length,
        explanation,
      });
    } else if (result.type === 'filter' && result.action === 'remove') {
      const newFilters = (currentFilters || []).filter(f => f.field !== result.field);
      const filtered = applyFilters(allCases, newFilters);
      const sampleStats = computeSampleStats(filtered);
      const explanation = await generateExplanation(
        newFilters, filtered.length, allCases.length, sampleStats
      );
      res.json({
        ...result,
        cases: filtered,
        filters_applied: newFilters,
        total_count: allCases.length,
        result_count: filtered.length,
        explanation,
      });
    } else {
      res.json(result);
    }
  } catch (err) {
    console.error('Follow-up error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/breakdown — compute breakdown by column
app.post('/api/breakdown', (req, res) => {
  const { filters, field } = req.body;
  const allCases = getAllCases();
  const filtered = applyFilters(allCases, filters || []);

  if (!field) return res.status(400).json({ error: 'Field is required' });

  const breakdown = computeBreakdown(filtered, field);
  res.json({ field, breakdown, total: filtered.length });
});

function computeBreakdown(cases, field) {
  const counts = {};
  for (const c of cases) {
    const val = (c[field] || '').toString().trim() || '(empty)';
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([value, count]) => ({
      value,
      count,
      percentage: ((count / cases.length) * 100).toFixed(1),
    }));
}

function computeSampleStats(cases) {
  if (cases.length === 0) return {};

  const numericFields = ['DPD', 'POS', 'Amount Pending', 'EMI', 'Call Sent count'];
  const stats = {};

  for (const field of numericFields) {
    const values = cases.map(c => parseFloat(c[field])).filter(v => !isNaN(v));
    if (values.length > 0) {
      stats[field] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        count: values.length,
      };
    }
  }

  const stateCounts = {};
  for (const c of cases) {
    const s = c['State'] || 'Unknown';
    stateCounts[s] = (stateCounts[s] || 0) + 1;
  }
  stats.top_states = Object.entries(stateCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([state, count]) => ({ state, count }));

  return stats;
}

loadCSV()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to load CSV:', err);
    process.exit(1);
  });
