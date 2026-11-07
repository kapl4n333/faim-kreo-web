// Иконки меню: простые линии в стиле навигации FTask (stroke, 24×24).
const P = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  devices: '<rect x="2.5" y="4" width="13" height="10" rx="1.5"/><path d="M6 18h6M9 14v4"/><rect x="17" y="7" width="4.5" height="11" rx="1.2"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0115 0"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z"/>',
  sliders: '<path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M2 15h4M10 8h4M18 16h4"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
};
export const icon = (name) => `<svg class="wic" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`;
