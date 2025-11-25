const express = require('express');
const cors = require('cors');

const app = express();

// allow JSON bodies
app.use(express.json());

// allow your React app to call this API
app.use(cors());

// simple test route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Inventory Brew API' });
});

// pick a port (later we'll use 5000 for backend)
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
