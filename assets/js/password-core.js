/* SocialTush password generator: generation and strength logic.
 * Runs only in the visitor's browser. All randomness comes from crypto.getRandomValues() (Web Crypto API).
 * Nothing here logs, stores or transmits a password. */

export const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~|\'"`\\',
};
export const SIMILAR = 'O0oIl1|';                    // look-alike characters
export const AMBIGUOUS = '{}[]()/\\\'"`~,;:.<>|';      // symbols that are hard to read or type in some fields

export const MIN_LEN = 4, MAX_LEN = 128;

/** Uniform random integer in [0, n) using rejection sampling (no modulo bias). */
export function randomInt(n, rng) {
  if (!(n > 0 && n <= 0x100000000)) throw new RangeError('bad range');
  const get = rng || ((a) => crypto.getRandomValues(a));
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) { get(buf); if (buf[0] < limit) return buf[0] % n; }
}

function uniq(s) { return Array.from(new Set(Array.from(s))).join(''); }
function without(s, remove) { return Array.from(s).filter((c) => remove.indexOf(c) === -1).join(''); }

/**
 * Build the character groups for the chosen options.
 * opts: { lower, upper, digits, symbols, excludeSimilar, excludeAmbiguous, custom }
 * If opts.custom is a non-empty string, ONLY those characters are used (one group).
 */
export function buildGroups(opts) {
  let groups;
  if (opts.custom && String(opts.custom).length) {
    groups = [uniq(Array.from(String(opts.custom)).filter((c) => c.trim() !== '' && c.charCodeAt(0) >= 32).join(''))];
  } else {
    groups = ['lower', 'upper', 'digits', 'symbols'].filter((k) => opts[k]).map((k) => SETS[k]);
  }
  groups = groups.map((g) => {
    if (opts.excludeSimilar) g = without(g, SIMILAR);
    if (opts.excludeAmbiguous) g = without(g, AMBIGUOUS);
    return g;
  }).filter((g) => g.length > 0);
  return groups;
}

/** Validate options; returns '' or an error message for the visitor. */
export function checkOptions(len, opts) {
  if (!Number.isInteger(len) || len < MIN_LEN || len > MAX_LEN) return 'Choose a length between ' + MIN_LEN + ' and ' + MAX_LEN + ' characters.';
  const groups = buildGroups(opts);
  if (!groups.length) return opts.custom ? 'Your custom character set has no usable characters (after exclusions).' : 'Select at least one character type.';
  if (groups.length > len) return 'The password must be at least ' + groups.length + ' characters long to include every selected character type.';
  const all = uniq(groups.join(''));
  if (all.length < 2) return 'Use at least two different characters.';
  return '';
}

/**
 * Generate one password: one random character from every selected group (so each type is present),
 * the rest from the combined pool, then a Fisher-Yates shuffle. All randomness from crypto.getRandomValues().
 */
export function generate(len, opts, rng) {
  const err = checkOptions(len, opts);
  if (err) throw new Error(err);
  const groups = buildGroups(opts);
  const pool = uniq(groups.join(''));
  const chars = groups.map((g) => g[randomInt(g.length, rng)]);
  while (chars.length < len) chars.push(pool[randomInt(pool.length, rng)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1, rng); const t = chars[i]; chars[i] = chars[j]; chars[j] = t; }
  return chars.join('');
}

export function generateMany(count, len, opts, rng) {
  const n = Math.max(1, Math.min(10, count | 0));
  const out = [];
  for (let i = 0; i < n; i++) out.push(generate(len, opts, rng));
  return out;
}

/** Character types present in a password. */
export function typesIn(pw) {
  const t = [];
  if (/[a-z]/.test(pw)) t.push('lowercase');
  if (/[A-Z]/.test(pw)) t.push('uppercase');
  if (/[0-9]/.test(pw)) t.push('numbers');
  if (/[^A-Za-z0-9]/.test(pw)) t.push('symbols');
  return t;
}

/**
 * Strength of a password produced by this generator.
 * Entropy = length x log2(size of the character pool it was drawn from): the real search space for a random password.
 * Thresholds: < 50 bits Weak, 50-69 Fair, 70-99 Strong, >= 100 Very strong. Length counts as much as variety.
 */
export function strength(pw, poolSize) {
  const len = Array.from(pw).length;
  const size = poolSize || estimatePool(pw);
  const bits = len * Math.log2(Math.max(size, 1));
  const level = bits < 50 ? 0 : bits < 70 ? 1 : bits < 100 ? 2 : 3;
  const LABEL = ['Weak', 'Fair', 'Strong', 'Very strong'];
  const COLOR = ['#d0342c', '#e07b00', '#1a9d5b', '#0b5ed7'];
  const DESC = [
    'Too easy to crack with modern hardware. Increase the length or add character types.',
    'OK for low-value accounts. Make it longer for anything important.',
    'Hard to crack. Good for most accounts.',
    'Extremely hard to crack. Suitable for email, banking and password-manager master passwords.',
  ];
  return { bits: Math.round(bits), level, label: LABEL[level], color: COLOR[level], description: DESC[level], length: len, types: typesIn(pw), crack: crackTime(bits) };
}
/** Pool size guessed from the character classes present (used when the generator pool is unknown). */
export function estimatePool(pw) {
  let n = 0;
  if (/[a-z]/.test(pw)) n += 26; if (/[A-Z]/.test(pw)) n += 26; if (/[0-9]/.test(pw)) n += 10; if (/[^A-Za-z0-9]/.test(pw)) n += 32;
  return n || 1;
}
/** Average time to guess at 100 billion guesses per second (a large offline cracking rig). */
export function crackTime(bits) {
  const seconds = Math.pow(2, bits - 1) / 1e11;
  const units = [['century', 3153600000], ['year', 31536000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  if (seconds < 1) return 'less than a second';
  if (seconds > 3153600000 * 1e6) return 'more than a million centuries';
  for (const [u, s] of units) if (seconds >= s) { const v = Math.floor(seconds / s); return v.toLocaleString('en') + ' ' + (u === 'century' ? (v === 1 ? 'century' : 'centuries') : u + (v === 1 ? '' : 's')); }
  return 'less than a second';
}
