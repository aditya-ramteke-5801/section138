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
