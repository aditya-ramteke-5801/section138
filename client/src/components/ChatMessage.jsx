import React, { useState, memo, useMemo } from 'react';
import {
  Box, Typography, Paper, Chip, TextField, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import GavelIcon from '@mui/icons-material/Gavel';

const DISPLAY_COLUMNS = [
  { field: 'Name', headerName: 'Borrower Name', flex: 1.2, minWidth: 150 },
  { field: 'Loan Number', headerName: 'Loan Number', flex: 1, minWidth: 130 },
  { field: 'DPD', headerName: 'DPD', width: 80, type: 'number' },
  { field: 'POS', headerName: 'Principal Outstanding', flex: 1, minWidth: 120, type: 'number',
    valueFormatter: (value) => value ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '' },
  { field: 'Amount Pending', headerName: 'Amount Pending', flex: 1, minWidth: 120, type: 'number',
    valueFormatter: (value) => value ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '' },
  { field: 'Latest Disposition', headerName: 'Last Disposition', flex: 1.2, minWidth: 140 },
  { field: 'Call Sent count', headerName: 'Call Attempts', width: 100, type: 'number' },
  { field: 'Primary Address', headerName: 'Primary Address', flex: 1.5, minWidth: 180 },
  { field: 'Pin Code', headerName: 'Pin Code', width: 90 },
];

function ChatMessage({ message, onOptionSelect, onGenerateNotices, loading, generatingNotices }) {
  const { role, type } = message;
  const isUser = role === 'user';

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      maxWidth: type === 'results' ? '100%' : '85%',
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      width: type === 'results' || type === 'breakdown' ? '100%' : 'auto',
    }}>
      {type === 'text' && <TextBubble content={message.content} isUser={isUser} />}
      {type === 'question' && (
        <QuestionBubble
          question={message.question}
          questionIndex={message.questionIndex}
          totalQuestions={message.totalQuestions}
          onOptionSelect={onOptionSelect}
          disabled={loading}
          alreadyAnswered={message.answered}
        />
      )}
      {type === 'results' && (
        <ResultsBubble
          message={message}
          onGenerateNotices={onGenerateNotices}
          generatingNotices={generatingNotices}
        />
      )}
      {type === 'breakdown' && <BreakdownBubble message={message} />}
    </Box>
  );
}

export default memo(ChatMessage);

function TextBubble({ content, isUser }) {
  return (
    <Paper
      elevation={0}
      sx={{
        px: 2, py: 1.5,
        bgcolor: isUser ? 'primary.main' : 'white',
        color: isUser ? 'white' : 'text.primary',
        borderRadius: 3,
        borderTopRightRadius: isUser ? 4 : 20,
        borderTopLeftRadius: isUser ? 20 : 4,
        border: isUser ? 'none' : '1px solid',
        borderColor: 'grey.200',
      }}
    >
      <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{content}</Typography>
    </Paper>
  );
}

function QuestionBubble({ question, questionIndex, totalQuestions, onOptionSelect, disabled, alreadyAnswered }) {
  const [otherText, setOtherText] = useState('');
  const [answered, setAnswered] = useState(false);

  const isAnswered = answered || alreadyAnswered;

  const handleClick = (option) => {
    if (isAnswered || disabled) return;
    setAnswered(true);
    onOptionSelect(question, option, questionIndex);
  };

  const handleOtherSubmit = () => {
    if (!otherText.trim() || isAnswered || disabled) return;
    setAnswered(true);
    onOptionSelect(question, otherText.trim(), questionIndex);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        px: 2.5, py: 2,
        bgcolor: isAnswered ? 'grey.50' : 'white',
        borderRadius: 3,
        borderTopLeftRadius: 4,
        border: '1px solid',
        borderColor: 'grey.200',
        maxWidth: 500,
        opacity: isAnswered ? 0.6 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Question {questionIndex + 1} of {totalQuestions}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, color: isAnswered ? 'text.disabled' : 'text.primary' }}>
        {question.text}
      </Typography>
      {question.reason && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {question.reason}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {(question.options || []).map((opt) => (
          <Chip
            key={opt}
            label={opt}
            onClick={() => handleClick(opt)}
            disabled={isAnswered || disabled}
            sx={{
              cursor: isAnswered ? 'default' : 'pointer',
              fontWeight: 500,
              bgcolor: isAnswered ? 'grey.100' : 'primary.main',
              color: isAnswered ? 'text.disabled' : 'white',
              '&:hover': isAnswered ? {} : { bgcolor: 'primary.dark' },
              '&.Mui-disabled': { opacity: 0.5 },
            }}
          />
        ))}
      </Box>

      {!isAnswered && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <TextField
            size="small"
            placeholder="Or type your own answer..."
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleOtherSubmit();
              }
            }}
            sx={{ flex: 1 }}
            disabled={disabled}
          />
          <Button size="small" variant="contained" onClick={handleOtherSubmit} disabled={!otherText.trim() || disabled}>
            Send
          </Button>
        </Box>
      )}
    </Paper>
  );
}

const ResultsBubble = memo(function ResultsBubble({ message, onGenerateNotices, generatingNotices }) {
  const { cases, explanation, filtersApplied, resultCount, totalCount } = message;
  const rows = useMemo(() => (cases || []).map((c, i) => ({ id: i, ...c })), [cases]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [officerDialogOpen, setOfficerDialogOpen] = useState(false);
  const [officerName, setOfficerName] = useState('');
  const [officerPhone, setOfficerPhone] = useState('');

  const handleGenerateClick = () => {
    if (selectedRows.length === 0) return;
    setOfficerDialogOpen(true);
  };

  const handleOfficerSubmit = () => {
    if (!officerName.trim() || !officerPhone.trim()) return;
    setOfficerDialogOpen(false);
    const selectedCases = selectedRows.map(id => cases[id]);
    onGenerateNotices(selectedCases, { name: officerName.trim(), phone: officerPhone.trim() });
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Explanation card */}
      <Paper
        elevation={0}
        sx={{
          px: 2.5, py: 2, mb: 1.5,
          bgcolor: '#F0EEFE',
          borderRadius: 3,
          borderTopLeftRadius: 4,
          border: '1px solid #675AF9',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.dark' }}>
            {(resultCount || 0).toLocaleString()} cases selected
          </Typography>
          <Typography variant="caption" color="text.secondary">
            out of {(totalCount || 0).toLocaleString()} total
          </Typography>
        </Box>

        {filtersApplied && filtersApplied.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            {filtersApplied.map((f, i) => (
              <Chip
                key={i}
                label={`${f.field} ${f.operator} ${typeof f.value === 'object' ? JSON.stringify(f.value) : f.value}`}
                size="small"
                variant="outlined"
                sx={{ borderColor: '#675AF9', color: 'primary.dark', fontSize: '0.7rem' }}
              />
            ))}
          </Box>
        )}

        <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
          {explanation}
        </Typography>
      </Paper>

      {/* DataGrid */}
      <Paper elevation={0} sx={{ height: 500, border: '1px solid', borderColor: 'grey.200', borderRadius: 3 }}>
        <DataGrid
          rows={rows}
          columns={DISPLAY_COLUMNS}
          checkboxSelection
          disableRowSelectionOnClick
          onRowSelectionModelChange={(ids) => setSelectedRows(ids)}
          rowSelectionModel={selectedRows}
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          sx={{
            border: 'none',
            borderRadius: 3,
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: '#F7F7FB',
              fontWeight: 600,
            },
          }}
        />
      </Paper>

      {/* Generate Notices button */}
      <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
        {selectedRows.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {selectedRows.length} case{selectedRows.length !== 1 ? 's' : ''} selected for notice generation
          </Typography>
        )}
        <Button
          variant="contained"
          size="small"
          startIcon={generatingNotices ? <CircularProgress size={16} color="inherit" /> : <GavelIcon />}
          disabled={selectedRows.length === 0 || generatingNotices}
          onClick={handleGenerateClick}
        >
          {generatingNotices
            ? 'Generating Notices...'
            : `Generate Notices${selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}`
          }
        </Button>
      </Box>

      {/* Collection Officer Details Dialog */}
      <Dialog open={officerDialogOpen} onClose={() => setOfficerDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Collection Officer Details</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Officer Name"
            value={officerName}
            onChange={(e) => setOfficerName(e.target.value)}
            fullWidth
            size="small"
            autoFocus
          />
          <TextField
            label="Officer Phone Number"
            value={officerPhone}
            onChange={(e) => setOfficerPhone(e.target.value)}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOfficerDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleOfficerSubmit}
            disabled={!officerName.trim() || !officerPhone.trim()}
          >
            Generate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

function BreakdownBubble({ message }) {
  const { field, breakdown, message: text } = message;

  return (
    <Paper
      elevation={0}
      sx={{
        px: 2.5, py: 2,
        bgcolor: 'white',
        borderRadius: 3,
        borderTopLeftRadius: 4,
        border: '1px solid',
        borderColor: 'grey.200',
        width: '100%',
        maxWidth: 600,
      }}
    >
      {text && (
        <Typography variant="body2" sx={{ mb: 1.5 }}>{text}</Typography>
      )}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Breakdown by {field}
      </Typography>
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, bgcolor: '#F7F7FB' }}>{field}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#F7F7FB' }}>Count</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#F7F7FB' }}>%</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: '#F7F7FB', width: 120 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(breakdown || []).map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.value}</TableCell>
                <TableCell align="right">{row.count.toLocaleString()}</TableCell>
                <TableCell align="right">{row.percentage}%</TableCell>
                <TableCell>
                  <LinearProgress
                    variant="determinate"
                    value={parseFloat(row.percentage)}
                    sx={{
                      height: 6, borderRadius: 3,
                      bgcolor: 'grey.100',
                      '& .MuiLinearProgress-bar': { bgcolor: 'primary.main', borderRadius: 3 },
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
