import { getUser, logout } from '@netlify/identity';

const logoutBtn = document.getElementById('logout-btn');

logoutBtn?.addEventListener('click', async () => {
  await logout();
  window.location.href = '/';
});

document.querySelectorAll('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    const filter = chip.dataset.filter;
    document.querySelectorAll('.recipe-card-full').forEach((card) => {
      if (filter === 'all' || card.dataset.category === filter) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  });
});

async function init() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/login/';
  }
}

init();
