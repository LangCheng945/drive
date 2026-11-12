# Contributing / 貢獻指南

Thank you for helping make temporary sharing safer. Open an issue describing the problem before a large change. Do not include live share/manage URLs, uploaded content, credentials or personal data in issues.

1. Fork the repository and create a feature branch.
2. Install Node.js 22.17+, run `npm ci`, configure `.dev.vars`, and apply local migrations.
3. Keep client code separate from `src/lib/server`. Never buffer full uploads in Worker memory or expose bucket URLs.
4. Add meaningful integration coverage for changed authorization, capacity, lifecycle or cleanup behavior.
5. Run `npm run lint`, `npm run check`, `npm test`, and `npm run build`.
6. Submit a PR explaining the user-visible change, validation and migration implications.

不得只在前端實作安全限制；不得將不同 Fork 的資源綁定在一起。新增依賴前檢查授權與 Cloudflare runtime 相容性。修改 schema 請新增 migration，不要修改已部署的 migration。安全漏洞請依 SECURITY.md 私下回報。

By contributing, you agree your original contribution is provided under the MIT license. Preserve third-party notices and disclose reused code and its license. Be respectful and constructive.
