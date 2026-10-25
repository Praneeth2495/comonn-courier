// Shared config for all load-test scripts — targets the staging backend
// ONLY. Never point this at api.comonn.in / www.comonn.in.
export const BASE_URL = 'https://comonn-courier-staging.up.railway.app';

// Three tiers requested: 1k, 5k, 20k virtual users. k6 scenarios ramp up
// over 30s, hold for 2 minutes, then ramp down — long enough to see
// steady-state behavior at each tier, not just the initial burst.
export function scenarioFor(vus) {
  return {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '20s', target: vus },
      { duration: '45s', target: vus },
      { duration: '10s', target: 0 },
    ],
    gracefulRampDown: '5s',
    gracefulStop: '10s',
  };
}

// Set via: k6 run -e VUS=1000 <script>.js — defaults to 1000 (the first
// tier) if not passed, so a bare `k6 run` is still a safe smoke test.
export function vusFromEnv() {
  return Number(__ENV.VUS) || 1000;
}
