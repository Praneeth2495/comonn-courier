// Mirrors backend/src/controllers/auth.controller.js's passwordPolicyError —
// keeps the message the server would return in sync with what's shown
// before the user ever submits the form.
export function passwordPolicyError(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include at least one special character.';
  return null;
}

export const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a special character.';
