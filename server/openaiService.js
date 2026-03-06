const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Well-known column mappings for hardcoded accuracy
const COLUMN_ALIASES = {
  'dpd': 'DPD',
  'days past due': 'DPD',
  'overdue': 'DPD',
  'overdue days': 'DPD',
  'outstanding': 'POS',
  'principal outstanding': 'POS',
  'pos': 'POS',
  'amount pending': 'Amount Pending',
  'pending amount': 'Amount Pending',
  'due amount': 'Amount Pending',
  'state': 'State',
  'city': 'City',
  'pin code': 'Pin Code',
  'pincode': 'Pin Code',
  'name': 'Name',
  'borrower name': 'Name',
  'loan number': 'Loan Number',
  'disposition': 'Latest Disposition',
  'last disposition': 'Latest Disposition',
  'call attempts': 'Call Sent count',
  'calls': 'Call Sent count',
  'call count': 'Call Sent count',
  'emi': 'EMI',
  'gender': 'Gender',
  'occupation': 'Occupation',
  'cibil': 'CIBIL Score',
  'cibil score': 'CIBIL Score',
  'income': 'Income',
  'address': 'Primary Address',
  'primary address': 'Primary Address',
  'status': 'Status',
  'loan status': 'Status',
  'e-nach': 'E-Nach Enabled',
  'nach': 'E-Nach Enabled',
  'tenure': 'Tenure',
  'interest rate': 'Interest Rate',
  'marital status': 'Marital State',
};

async function parseQueryAndGenerateQuestions(query, columnContext) {
  // Only send key columns to reduce token usage
  const keyColumns = [
    'Loan Number', 'Name', 'Amount Pending', 'DPD', 'Status', 'State', 'City',
    'Pin Code', 'POS', 'EMI', 'E-Nach Enabled', 'Occupation', 'Gender',
    'CIBIL Score', 'CIBIL Range', 'Income', 'Marital State', 'Latest Disposition',
    'Call Sent count', 'Primary Address', 'Tenure', 'Interest Rate',
    'Customer Language', 'Due Date',
  ];

  const relevantContext = columnContext.filter(c => keyColumns.includes(c.name) && c.fillRate > 0);
  const columnInfo = relevantContext
    .map(c => `- "${c.name}" [${c.fillRate}% filled] (samples: ${c.samples.join(', ')})`)
    .join('\n');
  const emptyColumns = columnContext
    .filter(c => keyColumns.includes(c.name) && c.fillRate === 0)
    .map(c => c.name);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a legal case filtering assistant for a lending company's operations team. They want to pick borrower cases for sending legal notices.

Available columns in the dataset (with fill rates):
${columnInfo}
${emptyColumns.length > 0 ? `\nWARNING - These columns are EMPTY (0% data), NEVER filter on them: ${emptyColumns.join(', ')}` : ''}

Given a user's natural language query, extract structured filters and generate exactly 2-3 clarification questions.
IMPORTANT: Only filter on columns that have data (>0% fill rate). If user mentions "outstanding" or "POS", use "Amount Pending" instead since POS is empty.

Return JSON:
{
  "filters": [
    { "field": "exact column name", "operator": "equals|not_equals|contains|greater_than|less_than|greater_than_or_equal|less_than_or_equal|between|in|not_in|is_empty|is_not_empty", "value": "value or {min,max} for between or [array] for in/not_in" }
  ],
  "questions": [
    {
      "id": "q1",
      "text": "The question text",
      "reason": "Brief reason why this matters",
      "options": ["Option A", "Option B", "Option C"],
      "related_filter": { "field": "column name", "operator": "operator" }
    }
  ],
  "understanding": "One-line summary of what user wants"
}

IMPORTANT RULES:
- Generate exactly 2 or 3 questions, no more
- Each question MUST have 2-4 predefined options (no free text questions)
- Map user terms correctly: "overdue"/"days past due"→DPD, "outstanding"/"principal"/"POS"→"Amount Pending" (POS column is empty!), "pending"→"Amount Pending"
- NEVER use POS or EMI columns — they have no data. Use "Amount Pending" for any amount-related filters.
- Questions should cover: DPD threshold, geography, amount ranges, contact history, exclusions
- Use exact column names from the list above
- For numeric values, always use numbers not strings (e.g. 90 not "90")`
      },
      { role: 'user', content: query }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

async function generateFilterObject(originalFilters, questions, answers) {
  const qaContext = questions.map(q => ({
    question: q.text,
    answer: answers[q.id] || 'Not answered',
    related_filter: q.related_filter
  }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Merge original filters with user's clarification answers into final structured filters.

Return JSON:
{
  "filters": [
    { "field": "exact column name", "operator": "equals|not_equals|contains|greater_than|less_than|greater_than_or_equal|less_than_or_equal|between|in|not_in|is_empty|is_not_empty", "value": "value or {min,max} or [array]" }
  ]
}

If an answer modifies an existing filter, update it. If it adds a new constraint, add a filter.`
      },
      {
        role: 'user',
        content: JSON.stringify({ original_filters: originalFilters, clarification_answers: qaContext })
      }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

async function handleFollowUp(message, currentFilters, resultCount, columnNames) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a legal case filtering assistant. The user has already filtered cases and is now asking a follow-up question.

Current filters: ${JSON.stringify(currentFilters)}
Current result count: ${resultCount}

Available columns: ${columnNames.join(', ')}

CRITICAL COLUMN RULES:
- The "POS" column is EMPTY (0% data). NEVER use it for filtering or sorting.
- For anything related to "outstanding", "POS", "principal outstanding", "high amount", "high POS" → use "Amount Pending" instead.
- "high POS" or "high outstanding" means sort by "Amount Pending" descending and take the top N.

Determine the user's intent and respond with ONE of these JSON formats:

1. BREAKDOWN (e.g. "show by state", "breakdown by disposition", "DPD wise"):
{ "type": "breakdown", "field": "exact column name to group by", "message": "brief response" }

2. REPLACE FILTERS — use this when the user changes the value of an existing filter or adds a new one. ALWAYS return the COMPLETE set of filters that should apply (not just the new one). Look at the current filters and decide which to keep, which to modify, and which to add.
Examples:
- "DPD above 120" when current has DPD > 60 → replace DPD filter with new value, keep all others
- "only Maharashtra" when no State filter exists → add State filter, keep all others
- "remove the state filter" → return all filters except State
{ "type": "filter", "action": "replace_all", "filters": [<complete list of all filters that should apply>], "message": "brief response" }

3. SORT and/or LIMIT results (e.g. "top 300 by amount", "only 300 high POS cases", "top 100 highest outstanding", "pick 50 with highest DPD"):
{ "type": "sort_and_limit", "sort_field": "exact column name (use Amount Pending for POS/outstanding)", "sort_order": "desc", "limit": 300, "message": "brief response" }

4. RESET and start fresh:
{ "type": "reset", "message": "Sure, let's start over." }

5. General question or unclear:
{ "type": "text", "message": "your helpful response" }

IMPORTANT:
- For filter type, ALWAYS use action "replace_all" and return the COMPLETE final filter list. This prevents duplicate/conflicting filters.
- For numeric values, use numbers not strings (90 not "90").
- Filter operators: equals, not_equals, contains, greater_than, less_than, greater_than_or_equal, less_than_or_equal, between, in, not_in, is_empty, is_not_empty
- Map user terms: "disposition"→"Latest Disposition", "calls"→"Call Sent count", "DPD"→"DPD", "POS"/"outstanding"/"principal"→"Amount Pending".`
      },
      { role: 'user', content: message }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

async function generateExplanation(filterSummary, resultCount, totalCount, sampleStats) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `You are a legal operations assistant. Generate a brief (2-3 sentences) explanation of the filtered results for legal notice candidates. Be factual and concise.`
      },
      {
        role: 'user',
        content: `Filters: ${JSON.stringify(filterSummary)}
Result: ${resultCount} of ${totalCount} cases.
Stats: ${JSON.stringify(sampleStats)}`
      }
    ]
  });

  return response.choices[0].message.content;
}

module.exports = {
  parseQueryAndGenerateQuestions,
  generateFilterObject,
  handleFollowUp,
  generateExplanation,
  COLUMN_ALIASES,
};
