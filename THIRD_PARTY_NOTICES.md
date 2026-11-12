# Third-party notices

Original project code is MIT. Dependencies retain their own licenses and copyrights; the project license does not relicense them. No restricted third-party UI/template source was used. The interface and CSS were authored for this project; shadcn-svelte was unnecessary for this small component set.

Primary libraries used:

| Package | License | Use |
| --- | --- | --- |
| Svelte / SvelteKit / Cloudflare adapter | MIT | UI, routing and Pages adapter |
| Tailwind CSS | MIT | CSS tooling |
| @lucide/svelte | ISC | Icons (brand logos are not included in current Lucide) |
| qrcode | MIT | Browser-local QR generation |
| TypeScript / @cloudflare/workers-types | Apache-2.0 / MIT OR Apache-2.0 | Types and build checks |
| Vite / Vitest / ESLint / Wrangler / Miniflare | MIT | Development, validation and deployment |

The full installed dependency license inventory is in [docs/dependency-licenses.json](docs/dependency-licenses.json), and applicable installed production license/notice files are retained under [docs/licenses](docs/licenses). Development toolchain dependencies can include other compatible permissive or file-scoped copyleft licenses; their source is not copied into this application's original code. Distributed vendor binaries retain their own notices in their npm packages.

Regenerate after installing or upgrading dependencies with `node scripts/license-inventory.mjs`, and review every changed license before release. Keep applicable copyright notices when distributing bundles. Hosted Cloudflare services have their own terms of service; MIT does not grant service usage rights or remove provider billing requirements.
