import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Chip, IconButton,
  CircularProgress, Divider, List, ListItem, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import DownloadIcon from '@mui/icons-material/Download';
import EmailIcon from '@mui/icons-material/Email';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const QUILL_MODULES_EDITABLE = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'align': [] }],
    ['clean'],
  ],
};

const QUILL_MODULES_READONLY = { toolbar: false };
import {
  getNotice, updateNoticeContent, aiEditNotice, sendToLawyer,
  signNotice, rejectNotice, previewPdf, downloadPdf, sendEmail,
  fetchSignatureDataUrl,
} from '../api';

const STATUS_LABELS = {
  draft: 'Draft',
  pending_signature: 'Pending Signature',
  signed: 'Signed',
  dispatched: 'Dispatched',
};

const TONE_COLORS = {
  soft: '#4caf50',
  moderate: '#ff9800',
  strict: '#f44336',
  severe: '#9c27b0',
};

export default function NoticeEditor({ noticeId, onBack, userRole }) {
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    loadNotice();
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [noticeId]);

  const loadNotice = async () => {
    setLoading(true);
    try {
      const data = await getNotice(noticeId);
      setNotice(data);
      setEmailAddress(data.borrower_email || '');
    } catch (err) {
      console.error('Failed to load notice:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = useCallback((content) => {
    setNotice(prev => prev ? { ...prev, notice_content: content } : prev);

    // Auto-save with debounce
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await updateNoticeContent(noticeId, content);
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 1500);
  }, [noticeId]);

  const handleSave = async () => {
    if (!notice) return;
    setSaving(true);
    try {
      await updateNoticeContent(noticeId, notice.notice_content);
    } finally {
      setSaving(false);
    }
  };

  const handleAiEdit = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const updated = await aiEditNotice(noticeId, aiPrompt.trim());
      setNotice(updated);
      setAiPrompt('');
    } catch (err) {
      console.error('AI edit failed:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const handlePreviewPdf = async () => {
    setPdfError(null);
    setPdfLoading(true);
    try {
      // Save first so PDF has latest content (including signature if signed)
      await updateNoticeContent(noticeId, notice.notice_content);
      const blob = await previewPdf(noticeId);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      console.error('PDF preview failed:', err);
      let msg = err.message || 'PDF preview failed';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const j = JSON.parse(text);
          if (j.error) msg = j.error;
        } catch { /* ignore */ }
      } else if (err.response?.data?.error) msg = err.response.data.error;
      setPdfError(msg);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await downloadPdf(noticeId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Legal_Notice_${notice.borrower_name.replace(/\s+/g, '_')}_${notice.loan_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleSendToLawyer = async () => {
    try {
      await updateNoticeContent(noticeId, notice.notice_content);
      const updated = await sendToLawyer(noticeId);
      // Preserve notice_content in case response omits or truncates it (e.g. large payload)
      setNotice(prev => ({
        ...updated,
        notice_content: updated.notice_content ?? prev?.notice_content ?? '',
      }));
      onBack();
    } catch (err) {
      console.error('Send to lawyer failed:', err);
    }
  };

  const handleSign = async () => {
    try {
      // Close PDF preview so user sees editor after sign (avoids blank/stale PDF)
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      const content = notice.notice_content || '';
      // Already has signature image (embedded data URL or URL reference)
      const hasSignature = (content.includes('data:image/png;base64,') || content.includes('lawyer_signature')) && content.includes('Unnati Vashisth');
      // Match lawyer block: <p><strong>Unnati Vashisth</strong></p> then optional whitespace then <p>(Advocate)</p>
      const lawyerBlockRegex = /<p><strong>Unnati Vashisth<\/strong><\/p>\s*<p>\(Advocate\)<\/p>/;
      if (!hasSignature && lawyerBlockRegex.test(content)) {
        const dataUrl = await fetchSignatureDataUrl();
        const signatureParagraph = `<p class="ql-align-left"><img src="${dataUrl}" alt="Signature" style="max-height: 80px; margin-bottom: 4px;" /></p>`;
        const updatedContent = content.replace(
          lawyerBlockRegex,
          (match) => signatureParagraph + match
        );
        await updateNoticeContent(noticeId, updatedContent);
        setNotice(prev => prev ? { ...prev, notice_content: updatedContent } : prev);
      }
      const updated = await signNotice(noticeId, 'Unnati Vashisth (Advocate)');
      setNotice(updated);
      await loadNotice();
    } catch (err) {
      console.error('Sign failed:', err);
    }
  };

  const handleReject = async () => {
    try {
      const updated = await rejectNotice(noticeId, rejectComment);
      setNotice(updated);
      setRejectOpen(false);
      setRejectComment('');
    } catch (err) {
      console.error('Reject failed:', err);
    }
  };

  const handleSendEmail = async () => {
    if (!emailAddress.trim()) return;
    setEmailSending(true);
    try {
      await sendEmail(noticeId, emailAddress.trim());
      setEmailOpen(false);
      loadNotice();
    } catch (err) {
      console.error('Email send failed:', err);
    } finally {
      setEmailSending(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!notice) {
    return <Typography sx={{ p: 3 }}>Notice not found.</Typography>;
  }

  const isEditable = notice.status === 'draft' && userRole === 'legal_ops';

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <Box sx={{
        px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider',
        display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'background.paper',
      }}>
        <IconButton onClick={onBack} size="small"><ArrowBackIcon /></IconButton>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{notice.borrower_name}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
          {notice.loan_number}
        </Typography>
        <Chip label={`DPD ${notice.dpd_days}`} size="small"
          color={notice.dpd_days >= 365 ? 'error' : notice.dpd_days >= 180 ? 'warning' : 'default'}
        />
        <Chip label={notice.tone} size="small" sx={{ bgcolor: TONE_COLORS[notice.tone], color: 'white' }} />
        <Chip label={STATUS_LABELS[notice.status]} size="small"
          color={notice.status === 'signed' ? 'success' : notice.status === 'pending_signature' ? 'warning' : 'default'}
        />
        {notice.reject_comment && notice.status === 'draft' && (
          <Chip label={`Rejected: ${notice.reject_comment}`} size="small" color="error" variant="outlined" />
        )}
        <Box sx={{ flex: 1 }} />
        {saving && <CircularProgress size={16} />}
      </Box>

      {/* Main content: editor + AI panel */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Editor or PDF preview */}
        <Box sx={{ flex: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {pdfUrl ? (
            <Box sx={{ flex: 1, position: 'relative' }}>
              <iframe src={pdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
              <Button
                variant="contained" size="small"
                onClick={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); setPdfError(null); }}
                sx={{ position: 'absolute', top: 10, right: 10 }}
              >
                Close Preview
              </Button>
            </Box>
          ) : (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {pdfError && (
                <Box sx={{ px: 2, py: 1, bgcolor: 'error.light', color: 'error.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2">{pdfError}</Typography>
                  <Button size="small" sx={{ color: 'inherit', borderColor: 'currentColor' }} variant="outlined" onClick={() => { setPdfError(null); handlePreviewPdf(); }}>
                    Retry
                  </Button>
                </Box>
              )}
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <ReactQuill
                  value={notice.notice_content}
                  onChange={handleContentChange}
                  readOnly={!isEditable}
                  theme="snow"
                  style={{ height: 'calc(100% - 42px)' }}
                  modules={isEditable ? QUILL_MODULES_EDITABLE : QUILL_MODULES_READONLY}
                />
              </Box>
            </Box>
          )}
        </Box>

        {/* Right: AI prompt panel (hidden for lawyer) */}
        {userRole !== 'lawyer' && <Box sx={{
          flex: 1, minWidth: 320, maxWidth: 400, borderLeft: '1px solid', borderColor: 'divider',
          display: 'flex', flexDirection: 'column', bgcolor: 'background.paper',
        }}>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>AI Edit Assistant</Typography>
          </Box>

          {isEditable && (
            <Box sx={{ p: 2 }}>
              <TextField
                fullWidth multiline rows={3} size="small"
                placeholder='e.g. "Make the tone stricter", "Add Section 138 reference", "Change deadline to 15 days"'
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                disabled={aiLoading}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiEdit(); } }}
              />
              <Button
                fullWidth variant="contained" size="small" sx={{ mt: 1 }}
                onClick={handleAiEdit}
                disabled={!aiPrompt.trim() || aiLoading}
                startIcon={aiLoading ? <CircularProgress size={16} /> : <SendIcon />}
              >
                {aiLoading ? 'Applying...' : 'Apply'}
              </Button>
            </Box>
          )}

          <Divider />

          {/* Prompt history */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              Edit History ({notice.edit_history.length})
            </Typography>
            <List dense>
              {notice.edit_history.slice().reverse().map((entry, i) => (
                <ListItem
                  key={i}
                  sx={{
                    px: 1, py: 0.5,
                    cursor: entry.type === 'ai_prompt' ? 'pointer' : 'default',
                    borderRadius: 1,
                    '&:hover': entry.type === 'ai_prompt' ? { bgcolor: 'action.hover' } : {},
                  }}
                  onClick={() => {
                    if (entry.type === 'ai_prompt' && entry.prompt) {
                      setAiPrompt(entry.prompt);
                    }
                  }}
                >
                  <ListItemText
                    primary={entry.type === 'ai_prompt' ? entry.prompt : 'Manual edit'}
                    secondary={new Date(entry.timestamp).toLocaleString('en-IN')}
                    primaryTypographyProps={{
                      variant: 'body2',
                      sx: { fontStyle: entry.type === 'manual' ? 'italic' : 'normal' },
                    }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Chip label={entry.type === 'ai_prompt' ? 'AI' : 'Manual'} size="small"
                    sx={{ ml: 1, fontSize: '0.65rem' }}
                    color={entry.type === 'ai_prompt' ? 'primary' : 'default'}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        </Box>}
      </Box>

      {/* Bottom action bar */}
      <Box sx={{
        px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider',
        display: 'flex', gap: 1.5, alignItems: 'center', bgcolor: 'background.paper',
      }}>
        <Button size="small" variant="outlined" startIcon={pdfLoading ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
          onClick={handlePreviewPdf} disabled={pdfLoading}>
          Preview PDF
        </Button>

        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadPdf}>
          Download PDF
        </Button>

        <Box sx={{ flex: 1 }} />

        {/* Role-specific actions */}
        {userRole === 'legal_ops' && (
          <>
            {notice.status === 'draft' && (
              <Button size="small" variant="contained" startIcon={<SendIcon />} onClick={handleSendToLawyer}>
                Send to Lawyer
              </Button>
            )}
            {(notice.status === 'signed' || notice.status === 'dispatched') && (
              <Button size="small" variant="contained" color="success" startIcon={<EmailIcon />}
                onClick={() => setEmailOpen(true)}>
                Send Email
              </Button>
            )}
          </>
        )}

        {userRole === 'lawyer' && notice.status === 'pending_signature' && (
          <>
            <Button size="small" variant="outlined" color="error" startIcon={<CancelIcon />}
              onClick={() => setRejectOpen(true)}>
              Reject / Send Back
            </Button>
            <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />}
              onClick={handleSign}>
              Sign & Approve
            </Button>
          </>
        )}
      </Box>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Notice</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth multiline rows={3} sx={{ mt: 1 }}
            placeholder="Add a comment for legal ops (optional)..."
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleReject}>Reject</Button>
        </DialogActions>
      </Dialog>

      {/* Email dialog */}
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Send Notice via Email</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Send the signed notice PDF to the borrower via email.
          </Typography>
          <TextField
            fullWidth label="Borrower Email" value={emailAddress}
            onChange={(e) => setEmailAddress(e.target.value)}
            sx={{ mt: 1 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            The email will include an AI-generated summary and the signed PDF as attachment.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSendEmail} disabled={!emailAddress.trim() || emailSending}
            startIcon={emailSending ? <CircularProgress size={16} /> : <EmailIcon />}>
            {emailSending ? 'Sending...' : 'Send'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
