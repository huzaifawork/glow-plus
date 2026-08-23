// Lifted verbatim from the prototype's helper block.

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function normPhone(p) {
  return (p || '').replace(/\D/g, '');
}

export function initials(name) {
  return name.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function formatPhone(p) {
  const d = normPhone(p);
  if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  return p;
}

// Informational only — everyone still gets the free first month.
export const FOUNDING_BADGE_CAP = 50;
