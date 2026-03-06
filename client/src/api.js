import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export async function parseQuery(query) {
  const { data } = await api.post('/parse-query', { query });
  return data;
}

export async function runQuery(filters, questions, answers) {
  const { data } = await api.post('/run-query', { filters, questions, answers });
  return data;
}

export async function followUp(message, currentFilters) {
  const { data } = await api.post('/follow-up', { message, currentFilters });
  return data;
}

export async function getBreakdown(filters, field) {
  const { data } = await api.post('/breakdown', { filters, field });
  return data;
}

// Phase 2: Notice endpoints

export async function generateNotices(cases) {
  const { data } = await api.post('/generate-notices', { cases });
  return data;
}

export async function getNotices(status) {
  const params = status ? { status } : {};
  const { data } = await api.get('/notices', { params });
  return data;
}

export async function getNotice(id) {
  const { data } = await api.get(`/notices/${id}`);
  return data;
}

export async function updateNoticeContent(id, notice_content) {
  const { data } = await api.put(`/notices/${id}`, { notice_content });
  return data;
}

export async function aiEditNotice(id, prompt) {
  const { data } = await api.post(`/notices/${id}/ai-edit`, { prompt });
  return data;
}

export async function sendToLawyer(id) {
  const { data } = await api.post(`/notices/${id}/send-to-lawyer`);
  return data;
}

export async function signNotice(id, signed_by) {
  const { data } = await api.post(`/notices/${id}/sign`, { signed_by });
  return data;
}

export async function rejectNotice(id, comment) {
  const { data } = await api.post(`/notices/${id}/reject`, { comment });
  return data;
}

export async function previewPdf(id) {
  const response = await api.post(`/notices/${id}/preview-pdf`, {}, { responseType: 'blob' });
  return response.data;
}

export async function downloadPdf(id) {
  const response = await api.get(`/notices/${id}/download-pdf`, { responseType: 'blob' });
  return response.data;
}

export async function bulkDownload(notice_ids) {
  const response = await api.post('/notices/bulk-download', { notice_ids }, { responseType: 'blob' });
  return response.data;
}

export async function sendEmail(id, email) {
  const { data } = await api.post(`/notices/${id}/send-email`, { email });
  return data;
}

export async function bulkSendEmail(notice_ids) {
  const { data } = await api.post('/notices/bulk-send-email', { notice_ids });
  return data;
}

export async function bulkSendToLawyer(notice_ids) {
  const { data } = await api.post('/notices/bulk-send-to-lawyer', { notice_ids });
  return data;
}
