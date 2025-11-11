const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const db = require('./database');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/github/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE github_id = $1',
        [profile.id]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        await db.query(
          'UPDATE users SET github_access_token = $1, github_username = $2, updated_at = NOW() WHERE id = $3',
          [accessToken, profile.username, user.id]
        );
        done(null, user);
      } else {
        const insertResult = await db.query(
          'INSERT INTO users (github_id, github_username, github_access_token) VALUES ($1, $2, $3) RETURNING *',
          [profile.id, profile.username, accessToken]
        );
        done(null, insertResult.rows[0]);
      }
    } catch (error) {
      done(error, null);
    }
  }));
}

module.exports = passport;
