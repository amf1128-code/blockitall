// Browser API compatibility — Firefox uses `browser`, Chrome uses `chrome`.
// Firefox also polyfills `chrome` but its MV3 background scripts don't support
// service_worker syntax. This module exports a unified API reference.

export const api = globalThis.browser || globalThis.chrome;
