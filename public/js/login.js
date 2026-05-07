import {
  login,
  signup,
  getUser,
  getSettings,
  oauthLogin,
  handleAuthCallback,
  requestPasswordRecovery,
  updateUser,
  acceptInvite,
  AuthError,
} from '@netlify/identity';

const form = document.getElementById('auth-form');
const title = document.getElementById('auth-title');
const subtitle = document.getElementById('auth-subtitle');
const submitBtn = document.getElementById('auth-submit');
const toggleBtn = document.getElementById('toggle-mode');
const nameField = document.getElementById('name-field');
const msgEl = document.getElementById('auth-message');
const forgotSection = document.getElementById('forgot-password');
const forgotBtn = document.getElementById('forgot-btn');
const recoveryWrapper = document.getElementById('recovery-form-wrapper');
const recoveryForm = document.getElementById('recovery-form');
const backToLogin = document.getElementById('back-to-login');
const setPasswordWrapper = document.getElementById('set-password-wrapper');
const setPasswordForm = document.getElementById('set-password-form');
const oauthContainer = document.getElementById('oauth-buttons');

let isSignup = false;

function showMessage(text, type) {
  msgEl.textContent = text;
  msgEl.className = 'auth-message ' + type;
  msgEl.hidden = false;
}

function hideMessage() {
  msgEl.hidden = true;
}

function toggleMode() {
  isSignup = !isSignup;
  hideMessage();
  title.textContent = isSignup ? 'Create account' : 'Sign in';
  subtitle.textContent = isSignup ? 'Join Allplate and start cooking.' : 'Welcome back to the kitchen.';
  submitBtn.textContent = isSignup ? 'Create Account' : 'Sign In';
  toggleBtn.textContent = isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up";
  nameField.hidden = !isSignup;
  forgotSection.hidden = isSignup;
  document.getElementById('password').autocomplete = isSignup ? 'new-password' : 'current-password';
}

const providerLabels = { google: 'Google', github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' };

async function loadOAuthProviders() {
  try {
    const settings = await getSettings();
    if (!settings || !settings.providers) return;
    for (const [provider, enabled] of Object.entries(settings.providers)) {
      if (!enabled) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'oauth-btn';
      btn.textContent = 'Continue with ' + (providerLabels[provider] || provider);
      btn.addEventListener('click', () => oauthLogin(provider));
      oauthContainer.appendChild(btn);
    }
  } catch (_) {}
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();
  submitBtn.disabled = true;
  submitBtn.textContent = isSignup ? 'Creating...' : 'Signing in...';

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const name = document.getElementById('name').value;

  try {
    if (isSignup) {
      const user = await signup(email, password, { full_name: name || undefined });
      if (user.emailVerified) {
        window.location.href = '/members/';
      } else {
        showMessage('Check your email to confirm your account, then sign in.', 'success');
        toggleMode();
      }
    } else {
      await login(email, password);
      window.location.href = '/members/';
    }
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.status === 401) showMessage('Invalid email or password.', 'error');
      else if (error.status === 403) showMessage('Signups are not currently allowed.', 'error');
      else if (error.status === 422) showMessage('Please check your email and use a password with at least 8 characters.', 'error');
      else showMessage(error.message, 'error');
    } else {
      showMessage('Something went wrong. Please try again.', 'error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isSignup ? 'Create Account' : 'Sign In';
  }
});

toggleBtn.addEventListener('click', toggleMode);

forgotBtn.addEventListener('click', () => {
  form.hidden = true;
  document.querySelector('.auth-divider').hidden = true;
  oauthContainer.hidden = true;
  document.querySelector('.auth-toggle').hidden = true;
  forgotSection.hidden = true;
  recoveryWrapper.hidden = false;
});

backToLogin.addEventListener('click', () => {
  form.hidden = false;
  document.querySelector('.auth-divider').hidden = false;
  oauthContainer.hidden = false;
  document.querySelector('.auth-toggle').hidden = false;
  forgotSection.hidden = false;
  recoveryWrapper.hidden = true;
  hideMessage();
});

recoveryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('recovery-email').value;
  try {
    await requestPasswordRecovery(email);
    showMessage('Check your email for a password reset link.', 'success');
  } catch (error) {
    if (error instanceof AuthError) showMessage(error.message, 'error');
    else showMessage('Something went wrong.', 'error');
  }
});

setPasswordForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = document.getElementById('new-password').value;
  try {
    await updateUser({ password: newPassword });
    showMessage('Password updated. Redirecting...', 'success');
    setTimeout(() => { window.location.href = '/members/'; }, 1500);
  } catch (error) {
    if (error instanceof AuthError) showMessage(error.message, 'error');
    else showMessage('Something went wrong.', 'error');
  }
});

async function init() {
  try {
    const result = await handleAuthCallback();
    if (result) {
      switch (result.type) {
        case 'oauth':
        case 'confirmation':
          window.location.href = '/members/';
          return;
        case 'recovery':
          form.hidden = true;
          document.querySelector('.auth-divider').hidden = true;
          oauthContainer.hidden = true;
          document.querySelector('.auth-toggle').hidden = true;
          forgotSection.hidden = true;
          setPasswordWrapper.hidden = false;
          showMessage('Set your new password below.', 'success');
          return;
        case 'invite':
          isSignup = false;
          title.textContent = 'Accept invite';
          subtitle.textContent = 'Set a password to join Allplate.';
          nameField.hidden = true;
          forgotSection.hidden = true;
          if (result.token) {
            form.addEventListener('submit', async (e2) => {
              e2.preventDefault();
              e2.stopImmediatePropagation();
              const pw = document.getElementById('password').value;
              try {
                await acceptInvite(result.token, pw);
                window.location.href = '/members/';
              } catch (err) {
                showMessage(err instanceof AuthError ? err.message : 'Something went wrong.', 'error');
              }
            }, { once: true });
          }
          return;
      }
    }
  } catch (_) {}

  const user = await getUser();
  if (user) {
    window.location.href = '/members/';
    return;
  }

  loadOAuthProviders();
}

init();
