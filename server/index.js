require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const { loadCSV, getAllCases, getColumnNames, getColumnContext } = require('./dataLoader');
const { applyFilters, validateFilters } = require('./filterEngine');
const {
  parseQueryAndGenerateQuestions, generateFilterObject,
  handleFollowUp, generateExplanation,
} = require('./openaiService');
const { createNotice, getNotice, getAllNotices, updateNotice } = require('./noticeStore');
const { createCampaign, getCampaign, getAllCampaigns, updateCampaign } = require('./campaignStore');
const { generateNoticeContent, aiEditNotice, generateEmailBody, generateEmailSubject } = require('./noticeService');
const { generatePdf } = require('./pdfService');
const { sendNoticeEmail } = require('./emailService');
const archiver = require('archiver');

const path = require('path');
const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve lawyer signature from hackathon root (for editor display)
app.get('/api/lawyer_signature.png', (req, res) => {
  const sigPath = path.resolve(__dirname, '..', '..', 'lawyer_signature.png');
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(sigPath, (err) => {
    if (err) res.status(404).end();
  });
});

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
    // Validate filter field names before sending to client
    result.filters = validateFilters(result.filters || [], getColumnNames());
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

    const aiResult = await generateFilterObject(
      originalFilters, questions || [], answers || {}
    );
    const rawFilters = aiResult.filters || [];
    const sortField = aiResult.sort_field || null;
    const sortOrder = aiResult.sort_order === 'asc' ? 1 : -1;
    const limit = parseInt(aiResult.limit) || null;

    const allCases = getAllCases();
    const finalFilters = validateFilters(rawFilters, getColumnNames());
    let filtered = applyFilters(allCases, finalFilters);

    // Sort if requested
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = parseFloat(a[sortField]) || 0;
        const bVal = parseFloat(b[sortField]) || 0;
        return (bVal - aVal) * sortOrder;
      });
    }

    // Limit results if requested (e.g. "Top 300")
    const totalFiltered = filtered.length;
    if (limit && limit < filtered.length) {
      filtered = filtered.slice(0, limit);
    }

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
    } else if (result.type === 'filter') {
      // Always use the complete filter list returned by AI (replace_all)
      const newFilters = validateFilters(result.filters || [], getColumnNames());
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
    } else if (result.type === 'sort_and_limit') {
      const sortField = result.sort_field || 'Amount Pending';
      const sortOrder = result.sort_order === 'asc' ? 1 : -1;
      const limit = parseInt(result.limit) || 100;

      const sorted = [...currentResults].sort((a, b) => {
        const aVal = parseFloat(a[sortField]) || 0;
        const bVal = parseFloat(b[sortField]) || 0;
        return (bVal - aVal) * sortOrder;
      }).slice(0, limit);

      const sampleStats = computeSampleStats(sorted);
      const explanation = await generateExplanation(
        currentFilters, sorted.length, allCases.length, sampleStats
      );
      res.json({
        type: 'filter',
        cases: sorted,
        filters_applied: currentFilters,
        total_count: allCases.length,
        result_count: sorted.length,
        explanation: `Showing top ${sorted.length} cases sorted by ${sortField} (${result.sort_order === 'asc' ? 'lowest' : 'highest'} first). ${explanation}`,
        message: result.message,
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
      let min = values[0], max = values[0], sum = 0;
      for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
      }
      stats[field] = {
        min,
        max,
        avg: Math.round(sum / values.length),
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

// ============ CAMPAIGN Endpoints ============

// POST /api/campaigns — create a new campaign
app.post('/api/campaigns', (req, res) => {
  const { name, filters_used } = req.body;
  const campaign = createCampaign({ name, filters_used: filters_used || [] });
  res.json(campaign);
});

// GET /api/campaigns — list all campaigns with computed stats
app.get('/api/campaigns', (req, res) => {
  const campaigns = getAllCampaigns();
  const enriched = campaigns.map(c => {
    const notices = getAllNotices(null, c.id);
    return {
      ...c,
      stats: {
        total: notices.length,
        draft: notices.filter(n => n.status === 'draft').length,
        pending_signature: notices.filter(n => n.status === 'pending_signature').length,
        signed: notices.filter(n => n.status === 'signed').length,
        dispatched: notices.filter(n => n.status === 'dispatched').length,
        rejected: notices.filter(n => n.status === 'draft' && n.reject_comment).length,
      },
    };
  });
  res.json({ campaigns: enriched });
});

// GET /api/campaigns/:id — single campaign with stats
app.get('/api/campaigns/:id', (req, res) => {
  const campaign = getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const notices = getAllNotices(null, campaign.id);
  res.json({
    ...campaign,
    stats: {
      total: notices.length,
      draft: notices.filter(n => n.status === 'draft').length,
      pending_signature: notices.filter(n => n.status === 'pending_signature').length,
      signed: notices.filter(n => n.status === 'signed').length,
      dispatched: notices.filter(n => n.status === 'dispatched').length,
      rejected: notices.filter(n => n.status === 'draft' && n.reject_comment).length,
    },
  });
});

// PUT /api/campaigns/:id — update campaign
app.put('/api/campaigns/:id', (req, res) => {
  const campaign = getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const updated = updateCampaign(req.params.id, req.body);
  res.json(updated);
});

// ============ PHASE 2: Legal Notice Endpoints ============

// Handler for generate-notices (shared by both route paths)
async function handleGenerateNotices(req, res) {
  try {
    const { cases: selectedCases, officerDetails, campaign_id } = req.body;
    if (!selectedCases || !Array.isArray(selectedCases) || selectedCases.length === 0) {
      return res.status(400).json({ error: 'No cases provided' });
    }

    const results = [];
    for (let i = 0; i < selectedCases.length; i++) {
      const caseData = selectedCases[i];
      try {
        const { content, tone, referenceId } = await generateNoticeContent(caseData, officerDetails);
        const notice = createNotice({
          campaign_id: campaign_id || null,
          borrower_case_id: caseData['Loan Number'] || i,
          borrower_name: caseData['Name'] || '',
          borrower_email: caseData['Email'] || caseData['email'] || '',
          borrower_phone: caseData['Phone'] || caseData['Mobile'] || '',
          borrower_address: caseData['Primary Address'] || '',
          borrower_pin_code: caseData['Pin Code'] || '',
          loan_number: caseData['Loan Number'] || '',
          client: 'Slice (NorthStar Fintech Pvt. Ltd.)',
          dpd_days: parseInt(caseData['DPD']) || 0,
          pos: parseFloat(caseData['POS']) || 0,
          total_outstanding: parseFloat(caseData['Amount Pending'] || caseData['POS']) || 0,
          emi: parseFloat(caseData['EMI']) || 0,
          interest_rate: caseData['Interest Rate'] || '',
          notice_content: content,
          tone,
        });
        results.push(notice);
      } catch (err) {
        console.error(`Error generating notice for case ${i}:`, err.message);
        results.push({ error: err.message, case_index: i, borrower_name: caseData['Name'] });
      }
    }

    // Update campaign with new notice IDs
    if (campaign_id) {
      const campaign = getCampaign(campaign_id);
      if (campaign) {
        const newIds = results.filter(r => !r.error).map(r => r.id);
        updateCampaign(campaign_id, { notice_ids: [...campaign.notice_ids, ...newIds] });
      }
    }

    res.json({ notices: results, generated: results.filter(r => !r.error).length, failed: results.filter(r => r.error).length });
  } catch (err) {
    console.error('Generate notices error:', err);
    res.status(500).json({ error: err.message });
  }
}

// POST /api/generate-notices — generate notices for selected cases
app.post('/api/generate-notices', handleGenerateNotices);
// Also accept without /api prefix (in case proxy strips it)
app.post('/generate-notices', handleGenerateNotices);

// GET /api/notices — list all notices
app.get('/api/notices', (req, res) => {
  const { status, campaign_id } = req.query;
  const notices = getAllNotices(status || null, campaign_id || null);
  res.json({ notices });
});

// GET /api/notices/:id — get single notice
app.get('/api/notices/:id', (req, res) => {
  const notice = getNotice(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });
  res.json(notice);
});

// PUT /api/notices/:id — update notice content (manual edit)
app.put('/api/notices/:id', (req, res) => {
  const { notice_content } = req.body;
  const notice = getNotice(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });

  const updated = updateNotice(req.params.id, {
    notice_content,
    edit_history: [...notice.edit_history, { type: 'manual', prompt: null, timestamp: new Date().toISOString() }],
  });
  res.json(updated);
});

// POST /api/notices/:id/ai-edit — AI-powered edit
app.post('/api/notices/:id/ai-edit', async (req, res) => {
  try {
    const { prompt } = req.body;
    const notice = getNotice(req.params.id);
    if (!notice) return res.status(404).json({ error: 'Notice not found' });

    const updatedContent = await aiEditNotice(notice.notice_content, prompt);
    const updated = updateNotice(req.params.id, {
      notice_content: updatedContent,
      edit_history: [...notice.edit_history, { type: 'ai_prompt', prompt, timestamp: new Date().toISOString() }],
    });
    res.json(updated);
  } catch (err) {
    console.error('AI edit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notices/:id/send-to-lawyer
app.post('/api/notices/:id/send-to-lawyer', (req, res) => {
  const notice = getNotice(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });

  const updated = updateNotice(req.params.id, {
    status: 'pending_signature',
    sent_to_lawyer_at: new Date().toISOString(),
  });
  res.json(updated);
});

// POST /api/notices/:id/sign — lawyer signs
app.post('/api/notices/:id/sign', (req, res) => {
  const { signed_by } = req.body;
  const notice = getNotice(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });

  const updated = updateNotice(req.params.id, {
    status: 'signed',
    signed_at: new Date().toISOString(),
    signed_by: signed_by || 'Unnati Vashisth (Advocate)',
  });
  res.json(updated);
});

// POST /api/notices/:id/reject — lawyer rejects
app.post('/api/notices/:id/reject', (req, res) => {
  const { comment } = req.body;
  const notice = getNotice(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });

  const updated = updateNotice(req.params.id, {
    status: 'draft',
    reject_comment: comment || null,
    sent_to_lawyer_at: null,
  });
  res.json(updated);
});

// POST /api/notices/:id/preview-pdf — generate and return PDF
app.post('/api/notices/:id/preview-pdf', async (req, res) => {
  try {
    const notice = getNotice(req.params.id);
    if (!notice) return res.status(404).json({ error: 'Notice not found' });

    const pdfBuffer = await generatePdf(notice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="notice_${notice.loan_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notices/:id/download-pdf — download signed PDF
app.get('/api/notices/:id/download-pdf', async (req, res) => {
  try {
    const notice = getNotice(req.params.id);
    if (!notice) return res.status(404).json({ error: 'Notice not found' });

    const pdfBuffer = await generatePdf(notice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Legal_Notice_${notice.borrower_name.replace(/\s+/g, '_')}_${notice.loan_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF download error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notices/bulk-download — download multiple as ZIP
app.post('/api/notices/bulk-download', async (req, res) => {
  try {
    const { notice_ids } = req.body;
    if (!notice_ids || !Array.isArray(notice_ids) || notice_ids.length === 0) {
      return res.status(400).json({ error: 'No notice IDs provided' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="legal_notices.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const id of notice_ids) {
      const notice = getNotice(id);
      if (!notice) continue;
      const pdfBuffer = await generatePdf(notice);
      const filename = `Legal_Notice_${notice.borrower_name.replace(/\s+/g, '_')}_${notice.loan_number}.pdf`;
      archive.append(pdfBuffer, { name: filename });
    }

    await archive.finalize();
  } catch (err) {
    console.error('Bulk download error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notices/:id/send-email — send email with PDF to borrower
app.post('/api/notices/:id/send-email', async (req, res) => {
  try {
    const notice = getNotice(req.params.id);
    if (!notice) return res.status(404).json({ error: 'Notice not found' });

    const pdfBuffer = await generatePdf(notice);
    const subject = await generateEmailSubject(notice.loan_number);
    const body = await generateEmailBody(
      notice.notice_content, notice.borrower_name,
      notice.total_outstanding, notice.loan_number
    );

    const to = notice.borrower_email || req.body.email;
    if (!to) return res.status(400).json({ error: 'No email address available for this borrower' });

    await sendNoticeEmail({
      to, subject, body, pdfBuffer,
      borrowerName: notice.borrower_name,
      loanNumber: notice.loan_number,
    });

    const updated = updateNotice(req.params.id, {
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
      dispatch_email: to,
    });

    res.json({ success: true, notice: updated, email_sent_to: to });
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notices/bulk-send-email — send emails for multiple notices
app.post('/api/notices/bulk-send-email', async (req, res) => {
  try {
    const { notice_ids } = req.body;
    if (!notice_ids || !Array.isArray(notice_ids)) {
      return res.status(400).json({ error: 'No notice IDs provided' });
    }

    const results = [];
    for (const id of notice_ids) {
      const notice = getNotice(id);
      if (!notice) { results.push({ id, error: 'Not found' }); continue; }
      if (!notice.borrower_email) { results.push({ id, error: 'No email address' }); continue; }

      try {
        const pdfBuffer = await generatePdf(notice);
        const subject = await generateEmailSubject(notice.loan_number);
        const body = await generateEmailBody(
          notice.notice_content, notice.borrower_name,
          notice.total_outstanding, notice.loan_number
        );

        await sendNoticeEmail({
          to: notice.borrower_email, subject, body, pdfBuffer,
          borrowerName: notice.borrower_name, loanNumber: notice.loan_number,
        });

        updateNotice(id, { status: 'dispatched', dispatched_at: new Date().toISOString(), dispatch_email: notice.borrower_email });
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, error: err.message });
      }
    }

    res.json({ results, sent: results.filter(r => r.success).length, failed: results.filter(r => r.error).length });
  } catch (err) {
    console.error('Bulk email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notices/bulk-send-to-lawyer — bulk send to lawyer
app.post('/api/notices/bulk-send-to-lawyer', (req, res) => {
  const { notice_ids } = req.body;
  if (!notice_ids || !Array.isArray(notice_ids)) {
    return res.status(400).json({ error: 'No notice IDs provided' });
  }

  const results = [];
  for (const id of notice_ids) {
    const notice = getNotice(id);
    if (!notice) { results.push({ id, error: 'Not found' }); continue; }
    updateNotice(id, { status: 'pending_signature', sent_to_lawyer_at: new Date().toISOString() });
    results.push({ id, success: true });
  }
  res.json({ results });
});

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
