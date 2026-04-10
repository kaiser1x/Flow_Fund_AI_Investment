const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'FlowFund AI API', docs: 'Use /api/auth for register, login, logout, profile' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/plaid', require('./routes/plaid'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/market', require('./routes/market'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/debug', require('./routes/debug'));

app.listen(process.env.PORT || 5000, () => {
  console.log(`[STARTUP] Server running on port ${process.env.PORT || 5000}`);
  console.log(`[STARTUP] NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`[STARTUP] GEMINI_API_KEY present: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`[STARTUP] GEMINI model: gemini-2.5-flash`);
  const avKey = (process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY || '').trim();
  console.log(`[STARTUP] ALPHA_VANTAGE_API_KEY present: ${avKey.length > 0}`);
});
