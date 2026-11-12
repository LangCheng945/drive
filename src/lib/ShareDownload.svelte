<script lang="ts">
  import { page } from '$app/state';
  import { Download, File, ShieldCheck, Flag, ArrowLeft, AlertCircle, Eye } from '@lucide/svelte';
  import PreviewDialog from './PreviewDialog.svelte';
  import { previewType } from './preview';
  import { api, formatBytes, formatDate } from '#lib/ui.ts';
  let { publicMode = false }: { publicMode?: boolean } = $props();
  const apiPrefix = $derived(`/api/${publicMode ? 'public' : 'shares'}/${page.params.token}`);
  type ShareInfo = { name: string; size: number; mode: string; expiresAt: number; thumbnail: string | null };
  let previewOpen = $state(false);
  let info = $state<ShareInfo>();
  let loading = $state(true); let error = $state(''); let claimed = $state(false); let reporting = $state(false); let reason = $state(''); let reportState = $state(''); let reportBusy = $state(false);
  $effect(() => {
    const path = apiPrefix, request = new AbortController();
    loading = true; info = undefined; error = ''; claimed = false;
    api<ShareInfo>(path, { signal: request.signal }).then(v => { if (!request.signal.aborted) info = v; }).catch(e => { if (!request.signal.aborted) error = e.message; }).finally(() => { if (!request.signal.aborted) loading = false; });
    return () => request.abort();
  });
  async function report() { reportBusy = true; reportState = ''; try { await api(`${apiPrefix}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }); reportState = '檢舉已送出。'; reason = ''; } catch (e) { reportState = (e as Error).message; } finally { reportBusy = false; } }
</script>
<svelte:head><title>領取檔案 — LangCheng Drive</title><meta name="robots" content="noindex,nofollow"/></svelte:head>
<div class="utility-page"><a href="/" class="back-link"><ArrowLeft size={16}/> 回到首頁</a><section class="utility-card">
{#if loading}<div class="spinner"></div><h1>正在確認分享連結…</h1>
{:else if error}<AlertCircle size={35}/><h1>無法存取檔案</h1><p role="alert">{error}</p><a href="/" class="button primary">上傳檔案</a>
{:else if info}<div class="file-icon">{#if info.thumbnail}<img src={info.thumbnail} alt="檔案縮圖" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/>{:else}<File size={30}/>{/if}</div><h1 class="file-name">{info.name}</h1><p>{formatBytes(info.size)} · {info.mode === 'once' ? '一次性快傳' : '24 小時分享'}</p><div class="notice"><ShieldCheck size={18}/><span>{info.mode === 'once' ? '僅一次領取機會。按下領取後，即使下載中斷也無法重試。請先確認網路穩定。' : '到期前可以重複下載。請確認檔案來源可信再開啟。'}</span></div>{#if previewType(info.name)}<button class="button secondary full" style="margin-bottom:12px" disabled={claimed} onclick={() => previewOpen = true}><Eye size={18}/>預覽</button>{/if}<form method="POST" action={`${apiPrefix}/download`} onsubmit={() => { if (info?.mode === 'once') claimed = true; }}><button class="button primary full" disabled={claimed}><Download size={18}/>{claimed ? '已領取' : '領取並下載檔案'}</button></form><small class="expiry">有效至 {formatDate(info.expiresAt)}</small>{#if claimed}<p class="muted">若沒有開始下載，請重新整理確認連結狀態；唯一機會可能已被領取。</p>{/if}<button class="text-button report-link" onclick={() => reporting = !reporting}><Flag size={14}/> 檢舉這份檔案</button>{#if reporting}<form class="report-form" onsubmit={e => { e.preventDefault(); void report(); }}><label for="reason">檢舉原因</label><textarea id="reason" bind:value={reason} minlength="5" maxlength="1000" required placeholder="請描述疑似違規內容（勿提供個人機密）"></textarea><button class="button secondary" disabled={reportBusy}>{reportBusy ? '送出中…' : '送出檢舉'}</button><p role="status">{reportState}</p></form>{/if}{/if}
</section></div>

{#if previewOpen && info}<PreviewDialog item={{name:info.name,mode:info.mode,endpoint:apiPrefix,thumbnail:info.thumbnail}} onClose={() => previewOpen = false} onClaim={() => claimed = true}/>{/if}
