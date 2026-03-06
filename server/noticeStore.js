const crypto = require('crypto');

// In-memory store for notices
const notices = new Map();

function createNotice(data) {
  const id = crypto.randomUUID();
  const notice = {
    id,
    borrower_case_id: data.borrower_case_id || null,
    borrower_name: data.borrower_name || '',
    borrower_email: data.borrower_email || '',
    borrower_phone: data.borrower_phone || '',
    borrower_address: data.borrower_address || '',
    borrower_pin_code: data.borrower_pin_code || '',
    loan_number: data.loan_number || '',
    client: data.client || '',
    dpd_days: data.dpd_days || 0,
    pos: data.pos || 0,
    total_outstanding: data.total_outstanding || 0,
    emi: data.emi || 0,
    interest_rate: data.interest_rate || '',
    notice_content: data.notice_content || '',
    tone: data.tone || 'moderate',
    nearest_police_station: data.nearest_police_station || '',
    court_jurisdiction: data.court_jurisdiction || '',
    status: 'draft',
    created_at: new Date().toISOString(),
    sent_to_lawyer_at: null,
    signed_at: null,
    signed_by: null,
    dispatched_at: null,
    dispatch_email: null,
    reject_comment: null,
    edit_history: [],
  };
  notices.set(id, notice);
  return notice;
}

function getNotice(id) {
  return notices.get(id) || null;
}

function getAllNotices(statusFilter) {
  let result = Array.from(notices.values());
  if (statusFilter) {
    result = result.filter(n => n.status === statusFilter);
  }
  return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function updateNotice(id, updates) {
  const notice = notices.get(id);
  if (!notice) return null;
  Object.assign(notice, updates);
  notices.set(id, notice);
  return notice;
}

function deleteNotice(id) {
  return notices.delete(id);
}

module.exports = { createNotice, getNotice, getAllNotices, updateNotice, deleteNotice };
