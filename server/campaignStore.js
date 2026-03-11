const crypto = require('crypto');

const campaigns = new Map();

function generateCampaignName(filters) {
  const parts = [];
  for (const f of filters) {
    if (f.field === 'DPD') {
      const op = f.operator.includes('greater') ? '>' : f.operator.includes('less') ? '<' : '';
      parts.push(`DPD${op}${f.value}`);
    } else if (f.field === 'State' || f.field === 'City') {
      const val = Array.isArray(f.value) ? f.value.join('/') : f.value;
      parts.push(val);
    } else if (f.field === 'Amount Pending') {
      const op = f.operator.includes('greater') ? '>' : f.operator.includes('less') ? '<' : '';
      parts.push(`Amt${op}${Number(f.value).toLocaleString('en-IN')}`);
    }
  }
  const month = new Date().toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  return parts.length > 0 ? `${parts.join(', ')} - ${month}` : `Campaign - ${month}`;
}

function createCampaign(data) {
  const id = crypto.randomUUID();
  const name = data.name || generateCampaignName(data.filters_used || []);
  const campaign = {
    id,
    name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    filters_used: data.filters_used || [],
    notice_ids: data.notice_ids || [],
  };
  campaigns.set(id, campaign);
  return campaign;
}

function getCampaign(id) {
  return campaigns.get(id) || null;
}

function getAllCampaigns() {
  return Array.from(campaigns.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function updateCampaign(id, updates) {
  const campaign = campaigns.get(id);
  if (!campaign) return null;
  Object.assign(campaign, updates, { updated_at: new Date().toISOString() });
  campaigns.set(id, campaign);
  return campaign;
}

function deleteCampaign(id) {
  return campaigns.delete(id);
}

module.exports = { createCampaign, getCampaign, getAllCampaigns, updateCampaign, deleteCampaign, generateCampaignName };
