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

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});
