// script.js
document.addEventListener('DOMContentLoaded', () => {
  // Toggle mobile menu
  const btn = document.querySelector('.menu-toggle');
  const nav = document.querySelector('nav');
  btn.addEventListener('click', () => {
    nav.classList.toggle('open');
  });

  // Simple form validation
  const form = document.getElementById('contactForm');
  form.addEventListener('submit', function(e) {
    if (!form.checkValidity()) {
      e.preventDefault();
      alert('Please fill out all fields.');
    }
  });

  // (Additional modules: slider, lazy-loading images, etc.)
});
