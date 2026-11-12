<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Download, File, ShieldCheck, Flag, ArrowLeft, AlertCircle, Eye } from '@lucide/svelte';
  import { api, formatBytes, formatDate } from '#lib/ui.ts';
  let info = $state<{ name: string; size: number; mode: string; expiresAt: number; previewable: boolean; previewKind: 'image' | 'pdf' | 'text' | null }>();
  let loading = $state(true); let error = $state(''); let claimed = $state(false); let previewOpen = $state(false); let previewError = $state(false); let previewBusy = $state(false); let previewText = $state(''); let previewRequest: AbortController | undefined; let reporting = $state(false); let reason = $state(''); let reportState = $state(''); let reportBusy = $state(false);
  onMount(() => { api<typeof info>(`/api/shares/${page.params.token}`).then(v => info = v).catch(e => error = e.message).finally(() => loading = false); return () => previewRequest?.abort(); });
  async function togglePreview() {
    if (previewOpen) {
      previewRequest?.abort();
      previewOpen = false;
      return;
    }
    previewOpen = true;
    previewError = false;
    previewText = '';
    if (info?.previewKind !== 'text') return;
    previewBusy = true;
    previewRequest?.abort();
    const controller = new AbortController();
    previewRequest = controller;
    try {
      const response = await fetch(`/api/shares/${page.params.token}/preview`, {
        signal: controller.signal, cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('text/plain')) throw Error('preview unavailable');
      const text = await response.text();
      if (!controller.signal.aborted) previewText = text;
    } catch {
      if (!controller.signal.aborted) previewError = true;
    } finally {
      if (!controller.signal.aborted) previewBusy = false;
    }
  }
  async function report() { reportBusy = true; reportState = ''; try { await api(`/api/shares/${page.params.token}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }); reportState = '檢舉已送出。'; reason = ''; } catch (e) { reportState = (e as Error).message; } finally { reportBusy = false; } }
</script>
<svelte:head><title>領取檔案 — LangCheng Drive</title><meta name="robots" content="noindex,nofollow"/></svelte:head>
<div class="utility-page"><a href="/" class="back-link"><ArrowLeft size={16}/> 回到首頁</a><section class="utility-card">
{#if loading}<div class="spinner"></div><h1>正在確認分享連結…</h1>
{:else if error}<AlertCircle size={35}/><h1>無法開啟這個分享連結</h1><p role="alert">{error}</p><a href="/" class="button primary">回首頁上傳檔案</a>
{:else if info}<div class="file-icon"><File size={30}/></div><div class="eyebrow">檔案資訊</div><h1 class="file-name">{info.name}</h1><p>{formatBytes(info.size)} · {info.mode === 'once' ? '下載一次' : '限時分享'}</p><div class="notice"><ShieldCheck size={18}/><span>{info.mode === 'once' ? '這個連結只能下載一次。開始下載後，即使中斷也無法重試。' : '到期前可重複下載。開啟檔案前，請確認來源可信。'}</span></div>
{#if info.previewable && info.previewKind}
  <section class="file-preview" aria-label="檔案預覽">
    <button type="button" class="button secondary full file-preview-toggle" aria-expanded={previewOpen}
      onclick={togglePreview}>
      <Eye size={16}/>{previewOpen ? '收起預覽' : info.previewKind === 'image' ? '預覽圖片' : info.previewKind === 'pdf' ? '預覽 PDF' : '預覽文字'}
    </button>
    {#if previewOpen}
      {#if previewError}
        <p role="status">無法預覽這個檔案，請直接下載。</p>
      {:else if info.previewKind === 'image'}
        <img src={`/api/shares/${page.params.token}/preview`} alt={`圖片預覽：${info.name}`}
          loading="lazy" referrerpolicy="no-referrer" onerror={() => previewError = true}/>
      {:else if info.previewKind === 'pdf'}
        <iframe src={`/api/shares/${page.params.token}/preview`} title={`PDF 預覽：${info.name}`}
          sandbox="" loading="lazy" referrerpolicy="no-referrer" onerror={() => previewError = true}></iframe>
        <p>若瀏覽器未顯示 PDF，請使用下方的下載按鈕。</p>
      {:else if previewBusy}
        <p role="status">正在讀取文字…</p>
      {:else}
        <pre class="file-preview-text">{previewText}</pre>
      {/if}
    {/if}
  </section>
{/if}
<form method="POST" action={`/api/shares/${page.params.token}/download`} onsubmit={() => { if (info?.mode === 'once') claimed = true; }}><button class="button primary full" disabled={claimed}><Download size={18}/>{claimed ? '已送出下載請求，請查看瀏覽器' : '下載檔案'}</button></form><small class="expiry">有效至 {formatDate(info.expiresAt)}</small>{#if claimed}<p class="muted">如果沒有開始下載，這個連結仍可能已失效。</p>{/if}<button class="text-button report-link" onclick={() => reporting = !reporting}><Flag size={14}/> 檢舉檔案</button>{#if reporting}<form class="report-form" onsubmit={e => { e.preventDefault(); void report(); }}><label for="reason">檢舉原因</label><textarea id="reason" bind:value={reason} minlength="5" maxlength="1000" required placeholder="請簡述問題，勿填寫個人機密資訊"></textarea><button class="button secondary" disabled={reportBusy}>{reportBusy ? '送出中…' : '送出檢舉'}</button><p role="status">{reportState}</p></form>{/if}{/if}
</section></div>
