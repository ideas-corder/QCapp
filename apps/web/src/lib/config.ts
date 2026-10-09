// Edge-safe shared configuration: do not add Node-only imports here because
// middleware imports this module.
export const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3002';
