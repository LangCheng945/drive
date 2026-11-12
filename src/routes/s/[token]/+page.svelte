<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Download, File, ShieldCheck, Flag, ArrowLeft, AlertCircle } from '@lucide/svelte';
  import { api, formatBytes, formatDate } from '#lib/ui.ts';
  let info = $state<{ name: string; size: number; mode: string; expiresAt: number }>();
  let loading = $state(true); let error = $state(''); let claimed = $state(false); let reporting = $state(false); let reason = $state(''); let reportState = $state(''); let reportBusy = $state(false);
  onMount(() => { api<typeof info>(`/api/shares/${page.params.token}`).then(v => info = v).catch(e => error = e.message).finally(() => loading = false); });
  async function report() { reportBusy = true; reportState = ''; try { await api(`/api/shares/${page.params.token}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }); reportState = '已收到檢舉，管理員將進行處理。'; reason = ''; } catch (e) { reportState = (e as Error).message; } finally { reportBusy = false; } }
</script>
<svelte:head><title>領取檔案 — LangCheng Drive</title><meta name="robots" content="noindex,nofollow"/></svelte:head>
<div class="utility-page"><a href="/" class="back-link"><ArrowLeft size={16}/> 回到首頁</a><section class="utility-card">
{#if loading}<div class="spinner"></div><h1>正在確認分享連結…</h1>
{:else if error}<AlertCircle size={35}/><h1>這份分享已經告別。</h1><p role="alert">{error}</p><a href="/" class="button primary">分享自己的檔案</a>
{:else if info}<div class="file-icon"><File size={30}/></div><div class="eyebrow">A FILE FOR YOU</div><h1 class="file-name">{info.name}</h1><p>{formatBytes(info.size)} · {info.mode === 'once' ? '一次性快傳' : '24 小時分享'}</p><div class="notice"><ShieldCheck size={18}/><span>{info.mode === 'once' ? '僅一次領取機會。按下領取後，即使下載中斷也無法重試。請先確認網路穩定。' : '到期前可以重複下載。請確認檔案來源可信再開啟。'}</span></div><form method="POST" action={`/api/shares/${page.params.token}/download`} onsubmit={() => { if (info?.mode === 'once') claimed = true; }}><button class="button primary full" disabled={claimed}><Download size={18}/>{claimed ? '已送出領取請求，請查看瀏覽器下載' : '領取並下載檔案'}</button></form><small class="expiry">有效至 {formatDate(info.expiresAt)}</small>{#if claimed}<p class="muted">若沒有開始下載，請重新整理確認連結狀態；唯一機會可能已被領取。</p>{/if}<button class="text-button report-link" onclick={() => reporting = !reporting}><Flag size={14}/> 檢舉這份檔案</button>{#if reporting}<form class="report-form" onsubmit={e => { e.preventDefault(); void report(); }}><label for="reason">檢舉原因</label><textarea id="reason" bind:value={reason} minlength="5" maxlength="1000" required placeholder="請描述疑似違規內容（勿提供個人機密）"></textarea><button class="button secondary" disabled={reportBusy}>{reportBusy ? '送出中…' : '送出檢舉'}</button><p role="status">{reportState}</p></form>{/if}{/if}
</section></div>
