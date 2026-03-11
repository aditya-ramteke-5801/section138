import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({ baseURL });

/** Full URL for lawyer signature image (works in editor and when deployed). */
export function getSignatureImageUrl() {
  const origin = import.meta.env.VITE_API_URL && String(import.meta.env.VITE_API_URL).startsWith('http')
    ? new URL(import.meta.env.VITE_API_URL).origin
    : window.location.origin;
  return `${origin}/api/lawyer_signature.png`;
}

/** Fetch signature image, optionally resize for embedding, return as data URL. */
export async function fetchSignatureDataUrl(maxWidth = 280) {
  const url = getSignatureImageUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load signature image');
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      if (w <= maxWidth) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.round((h * maxWidth) / w);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('Failed to decode signature image'));
    img.src = dataUrl;
  });
}

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

// Campaign endpoints

export async function createCampaign(name, filters_used) {
  const { data } = await api.post('/campaigns', { name, filters_used });
  return data;
}

export async function getCampaigns() {
  const { data } = await api.get('/campaigns');
  return data;
}

export async function getCampaign(id) {
  const { data } = await api.get(`/campaigns/${id}`);
  return data;
}

export async function updateCampaign(id, updates) {
  const { data } = await api.put(`/campaigns/${id}`, updates);
  return data;
}

// Phase 2: Notice endpoints

export async function generateNotices(cases, officerDetails, campaignId) {
  const { data } = await api.post('/generate-notices', { cases, officerDetails, campaign_id: campaignId });
  return data;
}

export async function getNotices(status, campaignId) {
  const params = {};
  if (status) params.status = status;
  if (campaignId) params.campaign_id = campaignId;
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
