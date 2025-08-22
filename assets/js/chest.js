// Toggle treasure chest open/close
(function () {
  var chest = document.getElementById('chest');
  if (!chest) return;

  function toggle() {
    var open = chest.classList.toggle('open');
    chest.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  chest.addEventListener('click', toggle);
  chest.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
})();
