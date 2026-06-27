const express = require('express');
const cookieParser = require('cookie-parser');
const authRouter = require('./modules/auth/auth.routes');
const adminsRouter = require('./modules/admins/admin.routes');
const usersRouter = require('./modules/users/user.routes');
const metricsRouter = require('./modules/metrics/metrics.routes');
const healthRouter = require('./modules/health/health.routes');
const reportsRouter = require('./modules/reports/reports.routes');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backoffice' });
});

app.use('/api/admin/auth', authRouter);
app.use('/api/admin/admins', adminsRouter);
app.use('/api/admin/users', usersRouter);       // H4, H5
app.use('/api/admin/metrics', metricsRouter);   // H3
app.use('/api/admin/services/health', healthRouter); // H11
app.use('/api/admin/reports', reportsRouter);   // H7

app.use(errorHandler);

module.exports = app;
