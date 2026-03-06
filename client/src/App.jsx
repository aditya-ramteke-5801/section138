import React, { useState, useRef, useEffect } from 'react';
import {
  AppBar, Toolbar, Typography, Box, TextField, IconButton,
  CircularProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatMessage from './components/ChatMessage';
import { parseQuery, runQuery, followUp } from './api';

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

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const handleOptionSelect = async (question, option, questionIndex) => {
    addMessage({ role: 'user', type: 'text', content: option });

    const newAnswers = { ...answers, [question.id]: option };
    setAnswers(newAnswers);

    const nextIndex = questionIndex + 1;
    if (nextIndex < pendingQuestions.length) {
      showNextQuestion(pendingQuestions, nextIndex);
    } else {
      // All questions answered — run the query
      setLoading(true);
      try {
        await executeQuery(originalFilters, pendingQuestions, newAnswers);
      } finally {
        setLoading(false);
      }
    }
  };

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

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'primary.dark' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 1 }}>
            DPDzero
          </Typography>
          <Typography variant="body1" sx={{ ml: 2, opacity: 0.8 }}>
            Legal Case Picker
          </Typography>
        </Toolbar>
      </AppBar>

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
            loading={loading}
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
                // In clarifying phase, typed text acts as "Other" for current question
                const text = input.trim();
                if (!text) return;
                const currentQIdx = pendingQuestions.length - (pendingQuestions.length -
                  Object.keys(answers).length);
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
    </Box>
  );
}
