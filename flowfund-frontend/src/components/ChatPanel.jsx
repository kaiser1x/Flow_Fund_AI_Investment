import { useState, useRef, useEffect } from 'react';
import { sendMessage } from '../api/chat';

const C = {
  ink:    '#0f2d25',
  brand:  '#1a4d3e',
  accent: '#2ecc8a',
  border: 'rgba(15,45,37,0.09)',
  muted:  '#6b7c77',
  faint:  '#9aadaa',
  danger: '#dc2626',
  surface:'#fff',
};

const PROMPTS = [
  'How am I spending my money?',
  'What should I focus on to save?',
  'Break down my top expenses',
  'What recurring charges do I have?',
  'How can I improve my savings rate?',
];

export default function ChatPanel({ hasLinkedAccounts }) {
  const greeting = hasLinkedAccounts
    ? "Hi! I can see your linked account data. Ask me anything about your spending patterns, savings habits, or financial health."
    : "Hi! I'm your FlowFund AI assistant. Connect a bank account on the dashboard and sync — then I can answer using your real transaction data.";

  const [messages, setMessages] = useState([{ role: 'bot', text: greeting }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const { data } = await sendMessage(msg);
      setMessages(prev => [...prev, { role: 'bot', text: data.reply }]);
    } catch (_) {
      setMessages(prev => [...prev, { role: 'bot', text: 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div style={{
      background: C.surface,
      borderRadius: '16px',
      border: `1px solid ${C.border}`,
      boxShadow: '0 2px 4px rgba(15,45,37,0.05), 0 8px 24px rgba(15,45,37,0.07)',
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 120px)',
      minHeight: '460px',
      maxHeight: '680px',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        padding: '15px 20px',
        background: `linear-gradient(135deg, ${C.ink} 0%, ${C.brand} 100%)`,
        display: 'flex', alignItems: 'center', gap: '10px',
        flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '10px',
          background: 'rgba(46,204,138,0.18)',
          border: '1px solid rgba(46,204,138,0.38)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
        }}>
          🤖
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
            FlowFund AI
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>Educational Assistant</div>
        </div>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: C.accent,
          boxShadow: `0 0 0 3px rgba(46,204,138,0.2)`,
        }} />
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '16px 14px',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            gap: '8px', alignItems: 'flex-end',
          }}>
            {m.role === 'bot' && (
              <div style={{
                width: 24, height: 24, borderRadius: '7px', flexShrink: 0,
                background: 'rgba(26,77,62,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px',
              }}>
                🤖
              </div>
            )}
            <div style={{
              maxWidth: '82%',
              padding: m.role === 'user' ? '9px 13px' : '10px 14px',
              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: m.role === 'user' ? C.brand : '#f3f6f4',
              color: m.role === 'user' ? '#fff' : C.ink,
              fontSize: '13px', lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '7px',
              background: 'rgba(26,77,62,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px',
            }}>
              🤖
            </div>
            <div style={{
              padding: '11px 16px', borderRadius: '14px 14px 14px 4px',
              background: '#f3f6f4', display: 'flex', gap: '5px', alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: C.muted,
                  animation: `ff-bounce 1.3s ease-in-out ${i * 0.18}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts — only on first load */}
      {messages.length <= 1 && !loading && (
        <div style={{
          padding: '8px 12px',
          borderTop: `1px solid ${C.border}`,
          display: 'flex', flexWrap: 'wrap', gap: '6px',
          flexShrink: 0,
        }}>
          {PROMPTS.map(p => (
            <button
              key={p}
              onClick={() => handleSend(p)}
              style={{
                fontSize: '11px', padding: '5px 10px',
                border: '1px solid rgba(26,77,62,0.18)',
                borderRadius: '20px',
                background: 'rgba(26,77,62,0.04)',
                color: C.brand, cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,77,62,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(26,77,62,0.04)'; }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        padding: '5px 14px', flexShrink: 0,
        borderTop: `1px solid ${C.border}`,
        fontSize: '10px', color: C.faint,
        textAlign: 'center', lineHeight: 1.5,
      }}>
        Educational insights only · Not financial advice · Not a licensed advisor
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 12px', flexShrink: 0,
        borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: '8px',
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={loading}
          placeholder="Ask about your spending or savings…"
          style={{
            flex: 1, padding: '9px 13px',
            border: `1.5px solid ${input ? C.brand : C.border}`,
            borderRadius: '10px',
            fontSize: '13px', color: C.ink,
            background: C.surface, outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = C.brand; }}
          onBlur={e => { e.target.style.borderColor = input ? C.brand : C.border; }}
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          style={{
            width: 38, height: 38,
            background: (loading || !input.trim()) ? '#dde4e1' : C.brand,
            color: (loading || !input.trim()) ? C.faint : '#fff',
            border: 'none', borderRadius: '10px',
            fontSize: '17px', fontWeight: 700,
            cursor: (loading || !input.trim()) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
