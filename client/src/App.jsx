import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  AppBar, Toolbar, Typography, Box, TextField, IconButton,
  CircularProgress, Button, LinearProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatMessage from './components/ChatMessage';
import NoticeDashboard from './components/NoticeDashboard';
import NoticeEditor from './components/NoticeEditor';
import CampaignDashboard from './components/CampaignDashboard';
import UserSwitcher from './components/UserSwitcher';
import {
  parseQuery, runQuery, followUp,
  generateNotices, createCampaign, getCampaign,
} from './api';
import dpdzeroLogo from './assets/dpdzero-logo.png';

export default function App() {
  // Chat state
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

  // Navigation state
  // Legal ops views: campaigns | campaign-notices | picker | editor
  // Lawyer views: lawyer-notices | editor
  const [view, setView] = useState('campaigns');
  const [userRole, setUserRole] = useState('legal_ops');
  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [activeCampaignName, setActiveCampaignName] = useState('');
  const [generatingNotices, setGeneratingNotices] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // When role changes, go to default view
  const handleRoleChange = (role) => {
    setUserRole(role);
    setEditingNoticeId(null);
    setView(role === 'lawyer' ? 'lawyer-notices' : 'campaigns');
  };

  const addMessage = (msg) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), ...msg }]);
  };

  const resetChatState = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      type: 'text',
      content: 'Hi! Describe the borrower cases you want to pick for legal notices. For example: "Pick all borrowers in Maharashtra with DPD > 90 and outstanding above 50,000"',
    }]);
    setInput('');
    setFilters([]);
    setPendingQuestions([]);
    setAnswers({});
    setOriginalFilters([]);
    setCases(null);
    setPhase('query');
  };

  const handleNewCampaign = () => {
    setActiveCampaignId(null);
    setActiveCampaignName('');
    resetChatState();
    setView('picker');
  };

  const handleOpenCampaign = (campaign) => {
    setActiveCampaignId(campaign.id);
    setActiveCampaignName(campaign.name);
    setView('campaign-notices');
  };

  const handleAddMoreCases = () => {
    // Keep existing chat history, just reset phase so user can query again
    setPhase('query');
    setPendingQuestions([]);
    setAnswers({});
    addMessage({
      role: 'assistant',
      type: 'text',
      content: 'Sure! Describe the additional cases you want to add to this campaign.',
    });
    setView('picker');
  };

  const handleEditNotice = (noticeId) => {
    setEditingNoticeId(noticeId);
    setView('editor');
  };

  const handleBackFromEditor = () => {
    setEditingNoticeId(null);
    if (userRole === 'lawyer') {
      setView('lawyer-notices');
    } else if (activeCampaignId) {
      setView('campaign-notices');
    } else {
      setView('campaigns');
    }
  };

  const handleBackFromNotices = () => {
    setActiveCampaignId(null);
    setActiveCampaignName('');
    setView('campaigns');
  };

  // === Chat handlers ===

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
    setMessages(prev => prev.map(msg =>
      msg.type === 'question' && msg.question?.id === question.id
        ? { ...msg, answered: true }
        : msg
    ));
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

  const handleGenerateNotices = useCallback(async (selectedRows, officerDetails) => {
    if (!selectedRows || selectedRows.length === 0) return;

    setGeneratingNotices(true);

    try {
      // Create campaign if needed
      let campaignId = activeCampaignId;
      if (!campaignId) {
        const campaign = await createCampaign(null, filters);
        campaignId = campaign.id;
        setActiveCampaignId(campaign.id);
        setActiveCampaignName(campaign.name);
      }

      const result = await generateNotices(selectedRows, officerDetails, campaignId);
      setGeneratingNotices(false);

      addMessage({
        role: 'assistant',
        type: 'text',
        content: `Generated ${result.generated} notice${result.generated !== 1 ? 's' : ''} successfully${result.failed > 0 ? ` (${result.failed} failed)` : ''}. You can now view them in the campaign.`,
      });

      // Navigate to the campaign notices
      setTimeout(() => {
        setView('campaign-notices');
      }, 1500);
    } catch (err) {
      setGeneratingNotices(false);
      addMessage({
        role: 'assistant',
        type: 'text',
        content: `Failed to generate notices: ${err.response?.data?.error || err.message}`,
      });
    }
  }, [activeCampaignId, filters]);

  // === Render ===

  const renderContent = () => {
    if (view === 'editor' && editingNoticeId) {
      return (
        <NoticeEditor
          noticeId={editingNoticeId}
          onBack={handleBackFromEditor}
          userRole={userRole}
        />
      );
    }

    if (view === 'campaigns') {
      return (
        <CampaignDashboard
          onNewCampaign={handleNewCampaign}
          onOpenCampaign={handleOpenCampaign}
        />
      );
    }

    if (view === 'campaign-notices') {
      return (
        <NoticeDashboard
          onEditNotice={handleEditNotice}
          userRole={userRole}
          campaignId={activeCampaignId}
          campaignName={activeCampaignName}
          onBack={handleBackFromNotices}
          onAddMoreCases={handleAddMoreCases}
        />
      );
    }

    if (view === 'lawyer-notices') {
      return (
        <NoticeDashboard
          onEditNotice={handleEditNotice}
          userRole={userRole}
        />
      );
    }

    // view === 'picker'
    return (
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
    );
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'primary.dark' }}>
        <Toolbar sx={{ gap: 2 }}>
          <img
            src={dpdzeroLogo}
            alt="DPDzero"
            style={{ height: 32, cursor: 'pointer' }}
            onClick={() => {
              setUserRole('legal_ops');
              setView('campaigns');
              setEditingNoticeId(null);
            }}
          />
          <Typography variant="body1" sx={{ opacity: 0.8 }}>
          </Typography>

          <Box sx={{ flex: 1 }} />

          <UserSwitcher userRole={userRole} onRoleChange={handleRoleChange} />
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
      {renderContent()}
    </Box>
  );
}
