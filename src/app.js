require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const kraRoutes = require('./routes/kra');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { rateLimit } = require('./middleware/rateLimit');
const { secureHeaders } = require('./middleware/securityHeaders');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(secureHeaders);
app.use(rateLimit());
app.use(express.json({ limit: '10kb', strict: true }));
app.use(morgan('combined'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kra-api-gateway' });
});

app.use('/api/kra', kraRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
