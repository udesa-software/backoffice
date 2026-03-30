const express = require('express');
const authRouter = require('./modules/auth/auth.routes');
const adminsRouter = require('./modules/admins/admin.routes');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backoffice' });
});

app.use('/api/auth', authRouter);
app.use('/api/admins', adminsRouter);

app.use(errorHandler);

module.exports = app;
