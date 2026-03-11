import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, Chip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { getCampaigns } from '../api';

const STAT_CHIPS = [
  { key: 'total', label: 'Total', color: 'default' },
  { key: 'draft', label: 'Draft', color: 'default' },
  { key: 'pending_signature', label: 'Pending', color: 'warning' },
  { key: 'signed', label: 'Signed', color: 'success' },
  { key: 'dispatched', label: 'Dispatched', color: 'info' },
  { key: 'rejected', label: 'Rejected', color: 'error' },
];

export default function CampaignDashboard({ onNewCampaign, onOpenCampaign }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const data = await getCampaigns();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Campaigns</Typography>
          <Typography variant="body2" color="text.secondary">
            Each campaign is a batch of legal notices from a case selection
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onNewCampaign}
          sx={{ borderRadius: 2 }}
        >
          New Campaign
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : campaigns.length === 0 ? (
        <Paper elevation={0} sx={{
          p: 6, textAlign: 'center', border: '1px solid', borderColor: 'grey.200',
          borderRadius: 3,
        }}>
          <FolderOpenIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            No campaigns yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Start by picking cases and generating legal notices
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={onNewCampaign}>
            Start New Campaign
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F7F7FB' }}>
                <TableCell sx={{ fontWeight: 700 }}>Campaign</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Notices</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status Breakdown</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow
                  key={campaign.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => onOpenCampaign(campaign)}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {campaign.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(campaign.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {campaign.stats.total}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {STAT_CHIPS.filter(s => s.key !== 'total' && campaign.stats[s.key] > 0).map(s => (
                        <Chip
                          key={s.key}
                          label={`${s.label}: ${campaign.stats[s.key]}`}
                          size="small"
                          color={s.color}
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <IconButton size="small">
                      <ChevronRightIcon />
                    </IconButton>
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
