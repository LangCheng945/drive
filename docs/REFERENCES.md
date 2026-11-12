# Official references

Reviewed 2026-11-12; installed versions are pinned in package-lock.json. Source code includes no copied proprietary UI or restricted source. Check these sources again when upgrading:

- [SvelteKit Cloudflare adapter](https://svelte.dev/docs/kit/adapter-cloudflare): Pages/Workers build output and local bindings.
- [SvelteKit adapters](https://svelte.dev/docs/kit/adapters): current Vite plugin configuration (SvelteKit 3).
- [Tailwind CSS Vite integration](https://tailwindcss.com/docs/installation/using-vite): Tailwind 4 plugin and CSS import.
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/): known-length requirement, strongly consistent objects and delete.
- [Workers Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/): streaming instead of buffering.
- [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/): statement execution and transactional batch rollback.
- [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): mandatory Siteverify, hostname/action, expiration and replay convergence.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/): quotas and billing boundaries.
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/): separate Scheduled Worker.

Dependency licenses are checked from installed package metadata and shipped licenses, not inferred from framework names. See THIRD_PARTY_NOTICES.md and the generated dependency inventory.
