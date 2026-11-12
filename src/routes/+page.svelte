<script lang="ts">
  import { onMount } from 'svelte';
  import { CloudUpload, ArrowRight, Zap, Clock3, LockKeyhole, Check, Copy, ShieldCheck, RefreshCw, ArrowUpRight } from '@lucide/svelte';
  import QRCode from 'qrcode';
  import Turnstile from '#lib/Turnstile.svelte';
  import UploadRow from '#lib/UploadRow.svelte';
  import PublicFiles from '#lib/PublicFiles.svelte';
  import { makeThumbnail } from '#lib/preview.ts';
  import { api, formatBytes, formatDate } from '#lib/ui.ts';
  import '#lib/uploader.css';

  type Status = { capacity: number; maxFile: number; retention: number; occupied: number; uploadsEnabled: boolean; siteKey: string };
  type ShareResult = { share: string; manage: string; expiresAt: number; qr: string; name: string; visibility: 'public' | 'unlisted' };
  type HistoryItem = { thumbnail?: string | null; id: number; name: string; size: number; progress: number; status: 'success' | 'error'; message: string; result?: ShareResult };
  let status = $state<Status>();
  let statusError = $state('');
  let file = $state<File>();
  let thumbnail = $state<string | null>(null);
  let thumbnailTask: Promise<string | null> = Promise.resolve(null);
  let mode = $state<'once' | 'day'>('day');
  let visibility = $state<'public' | 'unlisted'>('public');
  let publicRefresh = $state(0);
  let verification = $state('');
  let revision = $state(0);
  let dragging = $state(false);
  let busy = $state(false);
  let stage = $state<'ready' | 'preparing' | 'uploading' | 'success' | 'error'>('ready');
  let progress = $state(0);
  let error = $state('');
  let result = $state<ShareResult>();
  let visibleResult = $state<ShareResult>();
  let history = $state<HistoryItem[]>([]);
  let copied = $state('');
  let input = $state<HTMLInputElement>(null!);
  let xhr: XMLHttpRequest | undefined;
  let reservationAbort: AbortController | undefined;
  let nextHistoryId = 0;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const total = $derived(history.length + (file ? 1 : 0));
  const completed = $derived(history.filter(item => item.status === 'success').length + (result ? 1 : 0));

  async function load() {
    statusError = '';
    try { status = await api<Status>('/api/status'); }
    catch (e) { statusError = (e as Error).message; }
  }
  onMount(() => {
    void load();
    return () => { reservationAbort?.abort(); xhr?.abort(); clearTimeout(copyTimer); };
  });
  function clearSelection() {
    if (busy) return;
    if (file && (result || stage === 'error')) {
      const item: HistoryItem = { thumbnail: thumbnail ? `data:image/webp;base64,${thumbnail}` : null, id: ++nextHistoryId, name: file.name, size: file.size, progress, status: result ? 'success' : 'error', message: error, result };
      history = [item, ...history].slice(0, 4);
    }
    file = undefined; thumbnail = null; thumbnailTask = Promise.resolve(null); result = undefined; visibleResult = undefined;
    stage = 'ready'; progress = 0; error = '';
    if (input) input.value = '';
  }
  function choose(f?: File) {
    if (busy || !f) return;
    clearSelection();
    if (!f.size) { error = '請選擇非空白檔案。'; return; }
    if (status && f.size > status.maxFile) { error = `單檔上限為 ${formatBytes(status.maxFile)}。`; return; }
    file = f;
    thumbnailTask = makeThumbnail(f);
    void thumbnailTask.then(value => { if (file === f) thumbnail = value; });
  }
  function drop(e: DragEvent) {
    e.preventDefault(); dragging = false;
    if (busy || !status?.uploadsEnabled) return;
    if (e.dataTransfer?.files.length !== 1) { error = '每次傳送一個檔案。完成後可以繼續新增。'; return; }
    choose(e.dataTransfer.files[0]);
  }
  async function start() {
    if (!file || !status || busy || !verification) return;
    busy = true; stage = 'preparing'; error = ''; progress = 0; visibleResult = undefined;
    const selectedFile = file;
    reservationAbort = new AbortController();
    let reservation: { upload: string; share: string; manage: string; expiresAt: number; publicId: string | null; visibility: 'public' | 'unlisted' } | undefined;
    try {
      const selectedThumbnail = await thumbnailTask;
      reservationAbort.signal.throwIfAborted();
      const created = await api<{ upload: string; share: string; manage: string; expiresAt: number; publicId: string | null; visibility: 'public' | 'unlisted' }>('/api/uploads', {
        method: 'POST', signal: reservationAbort.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedFile.name, size: selectedFile.size, mode, visibility, thumbnail: selectedThumbnail, turnstile: verification })
      });
      reservation = created; stage = 'uploading';
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest(); xhr = request;
        request.open('PUT', `/api/uploads/${created.upload}`);
        request.setRequestHeader('Content-Type', 'application/octet-stream');
        request.timeout = 125000;
        request.upload.onprogress = e => { if (e.lengthComputable) progress = Math.min(99, Math.round(e.loaded / e.total * 100)); };
        request.onerror = () => reject(new Error('網路中斷，請重試。預留空間會自動釋放。'));
        request.onabort = () => reject(new Error('已取消上傳。預留空間會自動釋放。'));
        request.ontimeout = () => reject(new Error('上傳逾時，請重新嘗試。'));
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) resolve();
          else {
            let message = '上傳失敗，請重試。';
            try { message = JSON.parse(request.responseText).message || message; } catch { /* use fallback */ }
            reject(new Error(message));
          }
        };
        request.send(selectedFile);
      });
      progress = 100; stage = 'success';
      result = { share: `${location.origin}/${created.publicId ? `p/${created.publicId}` : `s/${created.share}`}`, manage: `${location.origin}/manage#${created.manage}`, expiresAt: created.expiresAt, qr: '', name: selectedFile.name, visibility: created.visibility };
      visibleResult = result;
      // QR failure must never hide a successfully stored file's capabilities.
      try { result.qr = await QRCode.toDataURL(result.share, { width: 176, margin: 1, color: { dark: '#17221d', light: '#ffffff' } }); }
      catch { /* the share URL remains usable */ }
    } catch (e) {
      error = (e as Error).name === 'AbortError' ? '已取消上傳。預留空間會自動釋放。' : (e as Error).message; stage = 'error';
      if (reservation && !result) {
        try { await api(`/api/manage/${reservation.manage}`, { method: 'DELETE' }); } catch { /* cleanup retries */ }
      }
    } finally {
      busy = false; xhr = undefined; reservationAbort = undefined; verification = ''; revision++; publicRefresh++; void load();
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value); copied = label;
      clearTimeout(copyTimer); copyTimer = setTimeout(() => copied = '', 2200);
    } catch { error = '無法使用剪貼簿，請手動複製連結。'; }
  }
  function removeCurrent() {
    if (busy) { reservationAbort?.abort(); xhr?.abort(); return; }
    if (visibleResult === result) visibleResult = undefined;
    file = undefined; thumbnail = null; thumbnailTask = Promise.resolve(null); result = undefined; stage = 'ready'; progress = 0; error = '';
    if (input) input.value = '';
  }
  function retry() {
    if (!verification) {
      error = '請完成人機驗證後重試。';
      return;
    }
    void start();
  }
</script>

<svelte:head>
  <title>LangCheng Drive — 臨時檔案分享</title>
  <meta name="description" content="免登入的臨時檔案分享。單檔最高 50 MB，可選一次性下載或 24 小時分享。" />
</svelte:head>

<div class="drive-home">
  <section class="transfer-card" aria-label="檔案分享">
    <div class="transfer-card-heading">
      <div><h1>上傳檔案</h1>{#if total}<p aria-live="polite">已完成 {completed} / {total} 個檔案</p>{/if}</div>
    </div>
    <div class="transfer-drop" class:dragging class:locked={busy}
      ondragover={e => { e.preventDefault(); if (!busy && status?.uploadsEnabled) dragging = true; }}
      ondragleave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) dragging = false; }}
      ondrop={drop} role="region" aria-label="拖曳檔案上傳區域">
      <input bind:this={input} type="file" hidden onchange={() => choose(input.files?.[0])} disabled={busy || !status?.uploadsEnabled}/>
      <div class="transfer-cloud" aria-hidden="true"><CloudUpload size={25} strokeWidth={1.6}/></div>
      <div class="transfer-drop-copy"><h2>{dragging ? '放開以選取檔案' : '拖曳檔案至此'}</h2><p>單檔最高 {formatBytes(status?.maxFile ?? 50000000)}，每次一個</p></div>
      <button class="transfer-browse" onclick={() => input.click()} disabled={busy || !status?.uploadsEnabled}>選擇檔案</button>
    </div>
    {#if file || history.length}
      <div class="transfer-queue" aria-label="本次傳送紀錄">
        {#if file}
          <UploadRow thumbnail={thumbnail ? `data:image/webp;base64,${thumbnail}` : null} name={file.name} size={file.size} {progress} status={stage} message={error} onRemove={removeCurrent}
            onRetry={stage === 'error' ? retry : undefined} onView={result ? () => visibleResult = result : undefined}/>
        {/if}
        {#each history as item (item.id)}
          <UploadRow thumbnail={item.thumbnail} name={item.name} size={item.size} progress={item.progress} status={item.status} message={item.message}
            onRemove={() => { history = history.filter(h => h.id !== item.id); if (visibleResult === item.result) visibleResult = undefined; }}
            onView={item.result ? () => visibleResult = item.result : undefined}/>
        {/each}
      </div>
    {/if}
    {#if visibleResult}
      <section class="transfer-result" aria-label="分享連結與私人管理">
        <div class="transfer-result-heading"><span class="transfer-result-dot"></span><h3>上傳完成</h3><span>有效至 {formatDate(visibleResult.expiresAt)}</span></div>
        <p class="transfer-result-name" title={visibleResult.name}>{visibleResult.name} · {visibleResult.visibility === 'public' ? '公開' : '不公開'}</p>
        <div class="transfer-share-content">
          <div class="transfer-links">
            <label for="share-url">分享連結</label>
            <div class="transfer-url-field"><input id="share-url" readonly value={visibleResult.share} aria-label="分享連結"/><button onclick={() => copy(visibleResult!.share, 'share')} aria-label="複製分享連結" title="複製分享連結">{#if copied === 'share'}<Check size={16}/>{:else}<Copy size={16}/>{/if}</button></div>
            <div class="transfer-private"><LockKeyhole size={12}/><span>私人管理連結</span><button onclick={() => copy(visibleResult!.manage, 'manage')}>{copied === 'manage' ? '已複製' : '複製'}</button><a href={visibleResult.manage} aria-label="開啟私人管理連結" title="開啟私人管理連結"><ArrowUpRight size={14}/></a></div>
            <p class="transfer-private-hint">請保管管理連結，只有持有者能刪除檔案。</p>
          </div>
          {#if visibleResult.qr}<img class="transfer-qr" src={visibleResult.qr} width="88" height="88" alt="分享連結 QR Code"/>{/if}
        </div>
        <button class="transfer-next" onclick={clearSelection} disabled={busy}>上傳其他檔案 <ArrowRight size={14}/></button>
      </section>
    {/if}
    <div class="transfer-options">
      <span class="transfer-option-label">分享方式</span>
      <div class="transfer-mode-switch" role="group" aria-label="分享方式">
        <button class:selected={mode === 'once'} disabled={busy || !!result} onclick={() => mode = 'once'} aria-pressed={mode === 'once'}><Zap size={13}/>一次性快傳</button>
        <button class:selected={mode === 'day'} disabled={busy || !!result} onclick={() => mode = 'day'} aria-pressed={mode === 'day'}><Clock3 size={13}/>24 小時</button>
      </div>
    </div>
    <p class="transfer-mode-note"><ShieldCheck size={13}/><span>{mode === 'once' ? '只可領取一次，下載中斷也可能消耗唯一機會。' : '有效期限內可重複下載，到期立即停止存取。'}</span></p>
    <div class="transfer-options"><label class="transfer-option-label" for="visibility">可見範圍</label><select id="visibility" bind:value={visibility} disabled={busy || !!result}><option value="public">公開，顯示於下方列表</option><option value="unlisted">不公開，僅限連結下載</option></select></div>
    {#if status && !status.uploadsEnabled}<div class="notice">目前暫停上傳。現有分享連結仍可正常使用。</div>{/if}
    {#if file && !result && status?.uploadsEnabled}
      <div class="transfer-auth">
        {#if status.siteKey}<Turnstile siteKey={status.siteKey} onToken={v => verification = v} {revision}/>{:else}<p class="error-text">管理員尚未設定 Turnstile，暫時無法上傳。</p>{/if}
        <button class="transfer-send" disabled={busy || !verification} onclick={start}><span>{stage === 'preparing' ? '準備上傳…' : busy ? (progress >= 99 ? '確認儲存中…' : `正在上傳 ${progress}%`) : stage === 'error' ? '重試上傳' : '開始上傳'}</span><ArrowRight size={16}/></button>
        {#if stage === 'error' && !verification}<p class="transfer-retry-hint">請重新完成人機驗證後重試。</p>{/if}
      </div>
    {/if}
    {#if error && (!file || stage !== 'error')}<p class="transfer-error-notice" role="alert">{error}</p>{/if}
    <div class="transfer-capacity">
      <div><span class="transfer-capacity-label"><i></i>共享空間</span>{#if status}<span class="transfer-capacity-value">剩餘 {formatBytes(Math.max(0, status.capacity - status.occupied))}<span> / {formatBytes(status.capacity)}</span></span>{:else if statusError}<button onclick={load} class="transfer-load-retry">重新取得容量 <RefreshCw size={12}/></button>{:else}<span class="transfer-loading">正在取得容量…</span>{/if}</div>
      <div class="transfer-capacity-track"><div style:width={`${status ? Math.min(100, status.occupied / status.capacity * 100) : 0}%`}></div></div>
      {#if statusError}<p class="transfer-capacity-error" role="alert">{statusError}</p>{/if}
    </div>
  </section>
  <p class="transfer-privacy">檔案最長保留 {Math.round((status?.retention ?? 86400) / 3600)} 小時。未端對端加密，請勿上傳機密資料。</p>
  <PublicFiles refresh={publicRefresh}/>
</div>
