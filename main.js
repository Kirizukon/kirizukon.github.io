
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('on');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));


function sp(id) {
  document.querySelectorAll('.proj-content').forEach(content => {
    content.classList.add('hidden');
  });

  document.querySelectorAll('.proj-tab').forEach(btn => {
    btn.classList.remove('active', 'text-vio');
    btn.classList.add('text-lo');
  });

  document.getElementById('proj-' + id).classList.remove('hidden');

  const activeBtn = document.querySelector('[data-p="' + id + '"]');
  activeBtn.classList.add('active', 'text-vio');
  activeBtn.classList.remove('text-lo');
}

(function () {
  const toggle = document.getElementById('nav-toggle');
  const menu   = document.getElementById('nav-menu');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.classList.toggle('open', open);
  });
  menu.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.classList.remove('open');
    })
  );
})();


function openProgram(id) {
  document.querySelectorAll('.prog-panel-content').forEach(el => el.classList.add('hidden'));
  const content = document.getElementById('prog-' + id);
  if (content) content.classList.remove('hidden');
  document.getElementById('prog-panel').classList.add('open');
  document.getElementById('prog-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProgram() {
  document.getElementById('prog-panel').classList.remove('open');
  document.getElementById('prog-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeProgram();
});


(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const COUNT    = 70;
  const MAX_DIST = 130;
  const particles = [];

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  function init() {
    particles.length = 0;
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x:  Math.random() * canvas.width,
        y:  Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r:  Math.random() * 1.2 + 0.4,
      });
    }
  }

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const alpha = (1 - dist / MAX_DIST) * 0.18;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(168,85,247,${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(168,85,247,0.45)';
      ctx.fill();
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { resize(); init(); });
  resize();
  init();
  frame();
})();
