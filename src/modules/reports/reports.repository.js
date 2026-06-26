const { query } = require('../../config/database');

const reportsRepository = {
  async listReportGroups({ page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT
         reported_id,
         reported_username,
         COUNT(*)                   AS total_reports,
         COUNT(DISTINCT reporter_id) AS distinct_reporters,
         MAX(reported_at)           AS last_reported_at,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id',               id,
             'reporter_username', reporter_username,
             'reason',            reason,
             'reason_detail',     reason_detail,
             'reported_at',       reported_at
           ) ORDER BY reported_at DESC
         ) AS reports
       FROM user_reports
       WHERE status = 'pending'
       GROUP BY reported_id, reported_username
       ORDER BY total_reports DESC, last_reported_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },

  async countReportGroups() {
    const result = await query(
      `SELECT COUNT(DISTINCT reported_id) AS total
       FROM user_reports
       WHERE status = 'pending'`
    );
    return parseInt(result.rows[0].total, 10);
  },

  async markReportsStatus(reportedId, status) {
    await query(
      `UPDATE user_reports
       SET status = $1
       WHERE reported_id = $2 AND status = 'pending'`,
      [status, reportedId]
    );
  },
};

module.exports = { reportsRepository };
