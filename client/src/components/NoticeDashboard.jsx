import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Chip, Button, IconButton, TextField,
  MenuItem, Select, FormControl, InputLabel, Checkbox,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Tooltip, InputAdornment,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import EmailIcon from '@mui/icons-material/Email';
import SendIcon from '@mui/icons-material/Send';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import { getNotices, bulkSendToLawyer, bulkDownload, bulkSendEmail } from '../api';

const STATUS_COLORS = {
  draft: 'default',
  pending_signature: 'warning',
  signed: 'success',
  dispatched: 'info',
};

const STATUS_LABELS = {
  draft: 'Draft',
  pending_signature: 'Pending Signature',
  signed: 'Signed',
  dispatched: 'Dispatched',
};

export default function NoticeDashboard({ onEditNotice, userRole }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotices(statusFilter || undefined);
      setNotices(data.notices || []);
    } catch (err) {
      console.error('Failed to fetch notices:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchNotices(); }, [fetchNotices]);

  const filteredNotices = notices.filter(n => {
    if (!search) return true;
    const s = search.toLowerCase();
    return n.borrower_name.toLowerCase().includes(s) ||
      n.loan_number.toLowerCase().includes(s) ||
      n.client.toLowerCase().includes(s);
  });

  // For lawyer view, only show pending_signature
  const displayNotices = userRole === 'lawyer'
    ? filteredNotices.filter(n => n.status === 'pending_signature' || n.status === 'signed')
    : filteredNotices;

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selected.length === displayNotices.length) {
      setSelected([]);
    } else {
      setSelected(displayNotices.map(n => n.id));
    }
  };

  const handleBulkSendToLawyer = async () => {
    const draftIds = selected.filter(id => {
      const n = notices.find(x => x.id === id);
      return n && n.status === 'draft';
    });
    if (draftIds.length === 0) return;
    await bulkSendToLawyer(draftIds);
    setSelected([]);
    fetchNotices();
  };

  const handleBulkDownload = async () => {
    const signedIds = selected.filter(id => {
      const n = notices.find(x => x.id === id);
      return n && (n.status === 'signed' || n.status === 'dispatched');
    });
    if (signedIds.length === 0) return;
    const blob = await bulkDownload(signedIds);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'legal_notices.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkEmail = async () => {
    const signedIds = selected.filter(id => {
      const n = notices.find(x => x.id === id);
      return n && n.status === 'signed';
    });
    if (signedIds.length === 0) return;
    await bulkSendEmail(signedIds);
    setSelected([]);
    fetchNotices();
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Filters and actions bar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search by name, loan #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          }}
          sx={{ minWidth: 250 }}
        />

        {userRole !== 'lawyer' && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Status Filter</InputLabel>
            <Select value={statusFilter} label="Status Filter" onChange={(e) => setStatusFilter(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="pending_signature">Pending Signature</MenuItem>
              <MenuItem value="signed">Signed</MenuItem>
              <MenuItem value="dispatched">Dispatched</MenuItem>
            </Select>
          </FormControl>
        )}

        <Box sx={{ flex: 1 }} />

        {selected.length > 0 && userRole === 'legal_ops' && (
          <>
            <Button size="small" variant="outlined" startIcon={<SendIcon />} onClick={handleBulkSendToLawyer}>
              Send to Lawyer ({selected.filter(id => notices.find(n => n.id === id)?.status === 'draft').length})
            </Button>
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleBulkDownload}>
              Download ({selected.filter(id => { const n = notices.find(x => x.id === id); return n?.status === 'signed' || n?.status === 'dispatched'; }).length})
            </Button>
            <Button size="small" variant="outlined" color="success" startIcon={<EmailIcon />} onClick={handleBulkEmail}>
              Email ({selected.filter(id => notices.find(n => n.id === id)?.status === 'signed').length})
            </Button>
          </>
        )}
      </Box>

      {/* Notice count */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {displayNotices.length} notice{displayNotices.length !== 1 ? 's' : ''}
        {selected.length > 0 && ` (${selected.length} selected)`}
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : displayNotices.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: '1px solid', borderColor: 'grey.200' }}>
          <Typography color="text.secondary">
            {userRole === 'lawyer' ? 'No notices pending your review.' : 'No notices yet. Generate notices from the Case Picker.'}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#F7F7FB' }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.length === displayNotices.length && displayNotices.length > 0}
                    indeterminate={selected.length > 0 && selected.length < displayNotices.length}
                    onChange={toggleSelectAll}
                    size="small"
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Borrower</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Loan #</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Client</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">DPD</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Outstanding</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayNotices.map((notice) => (
                <TableRow key={notice.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.includes(notice.id)}
                      onChange={() => toggleSelect(notice.id)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{notice.borrower_name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{notice.loan_number}</TableCell>
                  <TableCell>{notice.client}</TableCell>
                  <TableCell align="right">
                    <Chip
                      label={notice.dpd_days}
                      size="small"
                      color={notice.dpd_days >= 365 ? 'error' : notice.dpd_days >= 180 ? 'warning' : 'default'}
                      sx={{ fontWeight: 600, minWidth: 50 }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {notice.total_outstanding ? `₹${Number(notice.total_outstanding).toLocaleString('en-IN')}` : '-'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={STATUS_LABELS[notice.status]}
                      color={STATUS_COLORS[notice.status]}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                    {notice.reject_comment && notice.status === 'draft' && (
                      <Tooltip title={`Rejected: ${notice.reject_comment}`}>
                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                          Sent back by lawyer
                        </Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {new Date(notice.created_at).toLocaleDateString('en-IN')}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit / View">
                      <IconButton size="small" onClick={() => onEditNotice(notice.id)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
