'use strict';

const crypto = require('crypto');
const { config } = require('../config');
const AppError = require('../utils/AppError');

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/**
 * Implements the GitHub OAuth "web application flow" by hand so the steps
 * are visible:
 *   1. Send the user to GitHub to approve access (getAuthorizeUrl).
 *   2. GitHub redirects back with a temporary `code`.
 *   3. We exchange that code for an access token (exchangeCodeForToken).
 *   4. We use the token to fetch their real GitHub profile.
 *
 * A random `state` value ties steps 1 and 2 together to prevent CSRF.
 */

/** Create an unguessable state token to store in the session. */
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

/** Build the URL we redirect the browser to in order to start login. */
function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: config.github.scopes.join(' '),
    state,
    allow_signup: 'true',
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchange the temporary code from GitHub for a real access token. */
async function exchangeCodeForToken(code) {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'AnaGit-Dashboard',
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
      redirect_uri: config.github.callbackUrl,
    }),
  });

  if (!res.ok) {
    throw new AppError('Failed to exchange OAuth code with GitHub', 502);
  }

  const data = await res.json();
  // GitHub returns errors in the body with a 200 status, e.g.
  // { error: "bad_verification_code", ... }
  if (data.error || !data.access_token) {
    throw new AppError(
      `GitHub OAuth error: ${data.error_description || data.error || 'no access token returned'}`,
      401
    );
  }

  return {
    accessToken: data.access_token,
    scopes: (data.scope || '').split(',').map((s) => s.trim()).filter(Boolean),
    tokenType: data.token_type,
  };
}

module.exports = {
  generateState,
  getAuthorizeUrl,
  exchangeCodeForToken,
};
