const express = require('express');
const router = express.Router();
const passport = require('../config/github');

router.get('/github', passport.authenticate('github', { scope: ['repo'] }));

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

router.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.github_username,
        githubId: req.user.github_id
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session destroy failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

module.exports = router;
