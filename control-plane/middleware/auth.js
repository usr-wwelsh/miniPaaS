function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

function optionalAuth(req, res, next) {
  next();
}

module.exports = {
  ensureAuthenticated,
  optionalAuth
};
