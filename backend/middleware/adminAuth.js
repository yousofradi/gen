/**
 * Admin authentication middleware.
 * Checks for x-admin-key header against ADMIN_API_KEY env var.
 */
const adminAuth = (req, res, next) => {
  const key = req.headers['x-admin-key'] || req.query.ADMIN_API_KEY;
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    console.warn('WARNING: ADMIN_API_KEY not set — admin routes are unprotected');
    return next();
  }

  if (!key || key !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized — invalid admin key' });
  }

  next();
};

module.exports = adminAuth;
