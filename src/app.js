const express = require('express');
const cookieParser = require('cookie-parser');
const authRouter = require('./modules/auth/auth.routes');
const adminsRouter = require('./modules/admins/admin.routes');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backoffice' });
});

app.use('/api/admin/auth', authRouter);
app.use('/api/admin/admins', adminsRouter);

app.use(errorHandler);

module.exports = app;
