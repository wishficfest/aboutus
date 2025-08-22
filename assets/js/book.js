(() => {
  const book = document.getElementById('book');
  if (!book) return;
  function toggle(){
    const open = book.classList.toggle('open');
    book.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  // buka/tutup dengan klik
  book.addEventListener('click', toggle);
  // aksesibilitas: Enter/Space
  book.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
})();
