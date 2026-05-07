import { getUser, logout, handleAuthCallback } from '@netlify/identity';

async function init() {
  try {
    await handleAuthCallback();
  } catch (_) {}

  const user = await getUser();
  const btn = document.getElementById('nav-auth-btn');
  if (!btn) return;

  if (user) {
    btn.textContent = 'My Recipes';
    btn.href = '/members/';
  }
}

init();
