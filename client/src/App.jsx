import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  AppBar, Toolbar, Typography, Box, TextField, IconButton,
  CircularProgress, ToggleButtonGroup, ToggleButton, Button, Badge,
  LinearProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import GavelIcon from '@mui/icons-material/Gavel';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ChatIcon from '@mui/icons-material/Chat';
import ChatMessage from './components/ChatMessage';
import NoticeDashboard from './components/NoticeDashboard';
import NoticeEditor from './components/NoticeEditor';
import { parseQuery, runQuery, followUp, generateNotices, getNotices } from './api';

export default function App() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      type: 'text',
      content: 'Hi! Describe the borrower cases you want to pick for legal notices. For example: "Pick all borrowers in Maharashtra with DPD > 90 and outstanding above 50,000"',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState([]);
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [originalFilters, setOriginalFilters] = useState([]);
  const [cases, setCases] = useState(null);
  const [phase, setPhase] = useState('query'); // query | clarifying | results
  const [selectedCaseIds, setSelectedCaseIds] = useState([]);

  // Phase 2 state
  const [view, setView] = useState('picker'); // picker | dashboard | editor
  const [userRole, setUserRole] = useState('legal_ops'); // legal_ops | lawyer
  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const [noticeCount, setNoticeCount] = useState(0);
  const [generatingNotices, setGeneratingNotices] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch notice count for badge
  useEffect(() => {
    if (view === 'picker') {
      getNotices().then(data => setNoticeCount(data.notices?.length || 0)).catch(() => {});
    }
  }, [view]);

  const addMessage = (msg) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), ...msg }]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    addMessage({ role: 'user', type: 'text', content: text });

    if (phase === 'query') {
      await handleInitialQuery(text);
    } else if (phase === 'results') {
      await handleFollowUpMessage(text);
    }
  };

  const handleInitialQuery = async (text) => {
    setLoading(true);
    try {
      const data = await parseQuery(text);
      setOriginalFilters(data.filters || []);
      setFilters(data.filters || []);

      addMessage({
        role: 'assistant',
        type: 'text',
        content: data.understanding || 'Got it. Let me ask a few questions to refine the selection.',
      });

      const qs = data.questions || [];
      setPendingQuestions(qs);
      setAnswers({});

      if (qs.length > 0) {
        setPhase('clarifying');
        showNextQuestion(qs, 0);
      } else {
        await executeQuery(data.filters || [], [], {});
      }
    } catch (err) {
      addMessage({
        role: 'assistant',
        type: 'text',
        content: `Something went wrong: ${err.response?.data?.error || err.message}. Please try again.`,
      });
    } finally {
      setLoading(false);
    }
  };

  const showNextQuestion = (qs, index) => {
    if (index >= qs.length) return;
    const q = qs[index];
    addMessage({
      role: 'assistant',
      type: 'question',
      question: q,
      questionIndex: index,
      totalQuestions: qs.length,
    });
  };

  const handleOptionSelect = useCallback(async (question, option, questionIndex) => {
    addMessage({ role: 'user', type: 'text', content: option });

    const newAnswers = { ...answers, [question.id]: option };
    setAnswers(newAnswers);

    const nextIndex = questionIndex + 1;
    if (nextIndex < pendingQuestions.length) {
      showNextQuestion(pendingQuestions, nextIndex);
    } else {
      setLoading(true);
      try {
        await executeQuery(originalFilters, pendingQuestions, newAnswers);
      } finally {
        setLoading(false);
      }
    }
  }, [answers, pendingQuestions, originalFilters]);

  const executeQuery = async (queryFilters, questions, finalAnswers) => {
    setLoading(true);
    try {
      const data = await runQuery(queryFilters, questions, finalAnswers);
      setFilters(data.filters_applied || []);
      setCases(data.cases);
      setPhase('results');

      addMessage({
        role: 'assistant',
        type: 'results',
        cases: data.cases,
        explanation: data.explanation,
        filtersApplied: data.filters_applied,
        resultCount: data.result_count,
        totalCount: data.total_count,
      });
    } catch (err) {
      addMessage({
        role: 'assistant',
        type: 'text',
        content: `Error running query: ${err.response?.data?.error || err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUpMessage = async (text) => {
    setLoading(true);
    try {
      const data = await followUp(text, filters);

      if (data.type === 'breakdown') {
        addMessage({
          role: 'assistant',
          type: 'breakdown',
          field: data.field,
          breakdown: data.breakdown,
          message: data.message,
        });
      } else if (data.type === 'filter') {
        setFilters(data.filters_applied || []);
        setCases(data.cases);
        addMessage({
          role: 'assistant',
          type: 'results',
          cases: data.cases,
          explanation: data.explanation,
          filtersApplied: data.filters_applied,
          resultCount: data.result_count,
          totalCount: data.total_count,
        });
      } else if (data.type === 'reset') {
        setFilters([]);
        setCases(null);
        setPhase('query');
        setPendingQuestions([]);
        setAnswers({});
        addMessage({ role: 'assistant', type: 'text', content: data.message });
      } else {
        addMessage({ role: 'assistant', type: 'text', content: data.message });
      }
    } catch (err) {
      addMessage({
        role: 'assistant',
        type: 'text',
        content: `Error: ${err.response?.data?.error || err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNotices = useCallback(async (selectedRows) => {
    if (!selectedRows || selectedRows.length === 0) return;

    setGeneratingNotices(true);
    setGenerationProgress({ current: 0, total: selectedRows.length });

    try {
      const result = await generateNotices(selectedRows);
      setGeneratingNotices(false);

      addMessage({
        role: 'assistant',
        type: 'text',
        content: `Generated ${result.generated} notice${result.generated !== 1 ? 's' : ''} successfully${result.failed > 0 ? ` (${result.failed} failed)` : ''}. Switch to the Notice Dashboard to view and edit them.`,
      });

      // Update notice count
      getNotices().then(data => setNoticeCount(data.notices?.length || 0)).catch(() => {});
    } catch (err) {
      setGeneratingNotices(false);
      addMessage({
        role: 'assistant',
        type: 'text',
        content: `Failed to generate notices: ${err.response?.data?.error || err.message}`,
      });
    }
  }, []);

  const handleEditNotice = (noticeId) => {
    setEditingNoticeId(noticeId);
    setView('editor');
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'primary.dark' }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 1 }}>
            DPDzero
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.8 }}>
            Legal Notice System
          </Typography>

          <Box sx={{ flex: 1 }} />

          {/* View switcher */}
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, v) => { if (v) { setView(v); setEditingNoticeId(null); } }}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.3)',
                '&.Mui-selected': { color: 'white', bgcolor: 'rgba(255,255,255,0.15)' },
              },
            }}
          >
            <ToggleButton value="picker"><ChatIcon sx={{ mr: 0.5 }} fontSize="small" />Case Picker</ToggleButton>
            <ToggleButton value="dashboard">
              <Badge badgeContent={noticeCount} color="error" max={999} sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem' } }}>
                <ListAltIcon sx={{ mr: 0.5 }} fontSize="small" />
              </Badge>
              Notices
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Role switcher */}
          <ToggleButtonGroup
            value={userRole}
            exclusive
            onChange={(_, r) => { if (r) setUserRole(r); }}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.3)',
                '&.Mui-selected': { color: 'white', bgcolor: 'rgba(255,255,255,0.15)' },
              },
            }}
          >
            <ToggleButton value="legal_ops">Legal Ops</ToggleButton>
            <ToggleButton value="lawyer">Lawyer</ToggleButton>
          </ToggleButtonGroup>
        </Toolbar>
      </AppBar>

      {/* Generation progress */}
      {generatingNotices && (
        <Box sx={{ px: 3, py: 2, bgcolor: '#F0EEFE', borderBottom: '1px solid', borderColor: 'primary.main' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Generating notices... This may take a moment.
          </Typography>
          <LinearProgress />
        </Box>
      )}

      {/* Main content */}
      {view === 'editor' && editingNoticeId ? (
        <NoticeEditor
          noticeId={editingNoticeId}
          onBack={() => setView('dashboard')}
          userRole={userRole}
        />
      ) : view === 'dashboard' ? (
        <NoticeDashboard onEditNotice={handleEditNotice} userRole={userRole} />
      ) : (
        <>
          {/* Chat messages area */}
          <Box sx={{
            flex: 1, overflowY: 'auto', px: 2, py: 2,
            display: 'flex', flexDirection: 'column', gap: 1.5,
          }}>
            {messages.map(msg => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onOptionSelect={handleOptionSelect}
                onGenerateNotices={handleGenerateNotices}
                loading={loading}
                generatingNotices={generatingNotices}
              />
            ))}
            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1 }}>
                <CircularProgress size={18} sx={{ color: 'primary.main' }} />
                <Typography variant="body2" color="text.secondary">Thinking...</Typography>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>

          {/* Input area */}
          <Box sx={{
            p: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
            display: 'flex', gap: 1, alignItems: 'flex-end',
          }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              maxRows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                phase === 'query'
                  ? 'Describe the cases you want to pick...'
                  : phase === 'clarifying'
                  ? 'Or type your own answer...'
                  : 'Ask a follow-up: "breakdown by state", "filter DPD > 120", "start over"...'
              }
              variant="outlined"
              size="small"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (phase === 'clarifying') {
                    const text = input.trim();
                    if (!text) return;
                    const unansweredIdx = Object.keys(answers).length;
                    if (unansweredIdx < pendingQuestions.length) {
                      const q = pendingQuestions[unansweredIdx];
                      setInput('');
                      handleOptionSelect(q, text, unansweredIdx);
                    }
                  } else {
                    handleSend();
                  }
                }
              }}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 3 },
              }}
            />
            <IconButton
              color="primary"
              onClick={() => {
                if (phase === 'clarifying') {
                  const text = input.trim();
                  if (!text) return;
                  const unansweredIdx = Object.keys(answers).length;
                  if (unansweredIdx < pendingQuestions.length) {
                    const q = pendingQuestions[unansweredIdx];
                    setInput('');
                    handleOptionSelect(q, text, unansweredIdx);
                  }
                } else {
                  handleSend();
                }
              }}
              disabled={loading || !input.trim()}
              sx={{
                bgcolor: 'primary.main', color: 'white', borderRadius: 2,
                '&:hover': { bgcolor: 'primary.dark' },
                '&.Mui-disabled': { bgcolor: 'grey.300', color: 'grey.500' },
                width: 40, height: 40,
              }}
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </Box>
        </>
      )}
    </Box>
  );
}
