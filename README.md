# LangCheng Drive

**免登入的臨時檔案分享服務。**v0.1.0 · Limited Beta

[English](README.en.md) · [部署](docs/DEPLOYMENT.md) · [架構與安全](docs/ARCHITECTURE.md) · [管理與修復](docs/OPERATIONS.md)

預定正式網址：<https://drive.langcheng.uk> · 原始碼：<https://github.com/LangCheng945/drive>

## 功能

- 真正的私人 R2 儲存與串流上下載，並非 UI Demo。
- 一次性快傳：D1 原子領取，只有一個請求成功。明確按下領取才消耗機會；中斷不退還。
- 24 小時分享：有效期內重複下載，到期即拒絕，背景 Cron 分批刪除。
- 全站共用 1,000,000,000 bytes，單檔 50,000,000 bytes，最長 86,400 秒，可由伺服器調整。
- 原子容量預留、長度強制驗證、失敗重試清理、孤兒物件巡檢、私人刪除連結。
- Turnstile 伺服器驗證、D1 頻率限制、Beta 邀請碼、管理員上傳開關與檢舉入口。
- 繁體中文、響應式深淺色介面、置中／精簡上傳區、真實進度與重試、近期傳送紀錄、QR Code、鍵盤操作與減少動畫支援。

## 快速開始

需求：Node.js **22.17+**、npm、Cloudflare 帳戶（R2 可能要求啟用計費帳戶，但本服務用量目標為免費額度）。

```sh
git clone https://github.com/LangCheng945/drive.git
cd drive
npm ci
cp .env.example .dev.vars
npm run db:local
npm run dev
```

先在 Cloudflare 建立獨立的開發用 Managed Turnstile widget，允許 `localhost` 與 `127.0.0.1`，將其 site key / secret 填入 `.dev.vars`，再開啟 Vite 顯示的本機網址。`.dev.vars` 的邀請碼需與表單一致；管理權杖及 rate salt 各自至少 32 字元。官方 dummy keys 不提供 action 且回傳 example.com，無法通過本專案嚴格檢查，請勿拿來測完整上傳。本地 D1、R2 使用模擬器，不會讀寫正式資料。若偏好完全模擬部署環境，執行 `npm run build` 再 `npm run preview`。離線後端整合測試不需要真實 Turnstile keys。

```sh
npm run lint
npm run check
npm test
npm run build
```

測試使用真正的 workerd / D1 SQLite / R2 本地模擬，僅 mock Turnstile 外部驗證回應。測試入口不會被部署。

## 部署自己的實例

Fork 後依 [Cloudflare CLI 部署指南](docs/DEPLOYMENT.md) 建立**自己的** D1、私人 R2、Pages、Turnstile 與 Scheduled Worker。不要重用他人的 database ID、bucket 或 secret。設定範例中的 ID 為佔位值；本機執行的資源 ID 也不是可共用的服務。

| 設定 | 預設 | 說明 |
| --- | --- | --- |
| `ENABLE_UPLOADS` | `false` | 環境層硬開關，須為字串 `true` 才允許上傳 |
| `TOTAL_CAPACITY_BYTES` | `1000000000` | 所有未確認刪除資料的共用上限 |
| `MAX_FILE_BYTES` | `50000000` | 單檔上限，硬上限 90 MB，避免 Free request body 限制 |
| `RETENTION_SECONDS` | `86400` | 1–86400 秒；保留時間從預留時計算 |
| `TURNSTILE_SITE_KEY` | 空 | 公開 widget key |
| `TURNSTILE_HOSTNAMES` | `drive.langcheng.uk` | 驗證成功回應允許的 hostname，以逗號分隔，不含 protocol |
| `TURNSTILE_SECRET_KEY` | 無 | Secret，僅伺服器可見 |
| `BETA_INVITE_CODE` | 無 | Secret，缺少時不接受任何上傳 |
| `ADMIN_TOKEN` | 無 | Secret，至少 32 字元 |
| `RATE_LIMIT_SALT` | 無 | 獨立 secret，至少 32 字元，用於雜湊 IP bucket |

## 隱私與限制

沒有公開檔案列表或帳號。不記錄原始 IP；限流保存帶 secret 雜湊的短期計數。D1 儲存檔名、大小、到期及狀態，權杖只保存 SHA-256。分享連結是持有者權限，請只交給信任的人。管理連結與分享連結分開，遺失後無法找回。

**未提供端對端加密或惡意程式掃描。** 管理員及雲端供應商可能存取內容；請勿傳機密資料，下載後請自行確認安全。高風險副檔名封鎖不等於內容安全。到期拒絕存取是即時的，實體刪除是最終一致；已開始的傳輸及接收者保存的副本無法撤回。D1 tombstone 保留以防止權杖重生並協助修復；metadata 的保存政策見架構文件。

採用免費方案可用的服務功能，但不保證永遠零費用。請監看 R2 operations/storage、Workers requests/CPU、D1 rows/size；大量濫用可能耗盡免費額度，詳見部署指南。

## 專案結構

```text
src/lib/server/    容量、權杖、防濫用、API 與清理邏輯
src/routes/        首頁、分享、私人管理頁與 Pages API
workers/          Scheduled Worker（與 Pages 共用清理實作）
migrations/       D1 schema、容量 trigger 與索引
tests/            本地 runtime 整合測試
docs/             部署、架構、管理、官方參考與授權
```

使用最新已安裝並驗證的套件版本，確切版本見 `package-lock.json`。SvelteKit 3 設定在 `vite.config.ts`，採用 subpath imports。英文文案已預留於 `src/lib/ui.ts`，完整英文 UI 切換尚未提供。

## 開源

MIT，見 [LICENSE](LICENSE)。第三方程式保留各自授權，見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。歡迎依 [CONTRIBUTING.md](CONTRIBUTING.md) 貢獻；安全問題請依 [SECURITY.md](SECURITY.md) 私下回報。
