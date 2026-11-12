<script lang="ts">
  import { onMount } from 'svelte';
  import { CloudUpload, ArrowRight, Zap, Clock3, LockKeyhole, Check, Copy, ShieldCheck, RefreshCw, RotateCcw, AlignCenter, List, ArrowUpRight, Plus } from '@lucide/svelte';
  import QRCode from 'qrcode';
  import Turnstile from '#lib/Turnstile.svelte';
  import UploadRow from '#lib/UploadRow.svelte';
  import { api, formatBytes, formatDate } from '#lib/ui.ts';
  import '#lib/uploader.css';

  type Status = { capacity: number; maxFile: number; retention: number; occupied: number; uploadsEnabled: boolean; siteKey: string };
  type ShareResult = { share: string; manage: string; expiresAt: number; qr: string; name: string };
  type HistoryItem = { id: number; name: string; size: number; progress: number; status: 'success' | 'error'; message: string; result?: ShareResult };
  let status = $state<Status>();
  let statusError = $state('');
  let file = $state<File>();
  let mode = $state<'once' | 'day'>('once');
  let layout = $state<'centered' | 'compact'>('centered');
  let invite = $state('');
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
      const item: HistoryItem = { id: ++nextHistoryId, name: file.name, size: file.size, progress, status: result ? 'success' : 'error', message: error, result };
      history = [item, ...history].slice(0, 4);
    }
    file = undefined; result = undefined; visibleResult = undefined;
    stage = 'ready'; progress = 0; error = '';
    if (input) input.value = '';
  }
  function choose(f?: File) {
    if (busy || !f) return;
    clearSelection();
    if (!f.size) { error = '請選擇非空白檔案。'; return; }
    if (status && f.size > status.maxFile) { error = `單檔上限為 ${formatBytes(status.maxFile)}。`; return; }
    file = f;
  }
  function drop(e: DragEvent) {
    e.preventDefault(); dragging = false;
    if (busy || !status?.uploadsEnabled) return;
    if (e.dataTransfer?.files.length !== 1) { error = '每次傳送一個檔案。完成後可以繼續新增。'; return; }
    choose(e.dataTransfer.files[0]);
  }
  async function start() {
    if (!file || !status || busy || !verification || !invite) return;
    busy = true; stage = 'preparing'; error = ''; progress = 0; visibleResult = undefined;
    const selectedFile = file;
    reservationAbort = new AbortController();
    let reservation: { upload: string; share: string; manage: string; expiresAt: number } | undefined;
    try {
      const created = await api<{ upload: string; share: string; manage: string; expiresAt: number }>('/api/uploads', {
        method: 'POST', signal: reservationAbort.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedFile.name, size: selectedFile.size, mode, invite, turnstile: verification })
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
      result = { share: `${location.origin}/s/${created.share}`, manage: `${location.origin}/manage#${created.manage}`, expiresAt: created.expiresAt, qr: '', name: selectedFile.name };
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
      busy = false; xhr = undefined; reservationAbort = undefined; verification = ''; revision++; void load();
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
    file = undefined; result = undefined; stage = 'ready'; progress = 0; error = '';
    if (input) input.value = '';
  }
  function retry() {
    if (!verification || !invite) {
      error = '重試前請確認邀請碼並完成人機驗證。';
      document.getElementById('invite')?.focus();
      return;
    }
    void start();
  }
</script>

<svelte:head>
  <title>LangCheng Drive — 分享，然後放下。</title>
  <meta name="description" content="免登入、隱私優先的臨時檔案交換。一次性快傳或 24 小時分享，簡單、快速、不留多餘痕跡。" />
</svelte:head>

<div class="drive-home">
  <div class="transfer-intro">
    <div class="transfer-eyebrow"><span></span> A SIMPLE, PRIVATE HANDOFF</div>
    <h1>分享，然後放下<span>。</span></h1>
    <p>檔案短暫停留。分享，就是這麼簡單。</p>
  </div>
  <section class="transfer-card" aria-label="檔案分享">
    <div class="transfer-card-heading">
      <div><h2>傳送檔案<span class="transfer-beta">BETA</span></h2><p aria-live="polite">{total ? `${completed} / ${total} 個檔案已完成` : '準備好你的下一次分享'}</p></div>
      <div class="transfer-heading-actions">
        <div class="transfer-layout-switch" role="group" aria-label="上傳區排列">
          <button class:chosen={layout === 'centered'} onclick={() => layout = 'centered'} aria-pressed={layout === 'centered'} title="置中排列"><AlignCenter size={13}/><span>置中</span></button>
          <button class:chosen={layout === 'compact'} onclick={() => layout = 'compact'} aria-pressed={layout === 'compact'} title="精簡排列"><List size={13}/><span>精簡</span></button>
        </div>
        <button class="transfer-reset" onclick={clearSelection} disabled={busy || !file} aria-label="準備下一個檔案" title="準備下一個檔案"><RotateCcw size={15}/></button>
      </div>
    </div>
    <div class="transfer-drop" class:compact={layout === 'compact'} class:dragging class:locked={busy}
      ondragover={e => { e.preventDefault(); if (!busy && status?.uploadsEnabled) dragging = true; }}
      ondragleave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) dragging = false; }}
      ondrop={drop} role="region" aria-label="拖曳檔案上傳區域">
      <input bind:this={input} type="file" hidden onchange={() => choose(input.files?.[0])} disabled={busy || !status?.uploadsEnabled}/>
      <div class="transfer-cloud" aria-hidden="true"><CloudUpload size={25} strokeWidth={1.6}/></div>
      <div class="transfer-drop-copy"><h3>{dragging ? '放開，準備傳送' : '拖曳檔案到這裡'}</h3><p>文件、圖片、影片或壓縮檔</p></div>
      <button class="transfer-browse" onclick={() => input.click()} disabled={busy || !status?.uploadsEnabled}>{result ? '新增檔案' : '選擇檔案'}{#if result}<Plus size={13}/>{/if}</button>
      <small class="transfer-file-limit">最高 {formatBytes(status?.maxFile ?? 50000000)} · 每次一個檔案</small>
    </div>
    {#if file || history.length}
      <div class="transfer-queue" aria-label="本次傳送紀錄">
        {#if file}
          <UploadRow name={file.name} size={file.size} {progress} status={stage} message={error} onRemove={removeCurrent}
            onRetry={stage === 'error' ? retry : undefined} onView={result ? () => visibleResult = result : undefined}/>
        {/if}
        {#each history as item (item.id)}
          <UploadRow name={item.name} size={item.size} progress={item.progress} status={item.status} message={item.message}
            onRemove={() => { history = history.filter(h => h.id !== item.id); if (visibleResult === item.result) visibleResult = undefined; }}
            onView={item.result ? () => visibleResult = item.result : undefined}/>
        {/each}
      </div>
    {/if}
    {#if visibleResult}
      <section class="transfer-result" aria-label="分享連結與私人管理">
        <div class="transfer-result-heading"><span class="transfer-result-dot"></span><h3>已準備好分享</h3><span>有效至 {formatDate(visibleResult.expiresAt)}</span></div>
        <p class="transfer-result-name" title={visibleResult.name}>{visibleResult.name}</p>
        <div class="transfer-share-content">
          <div class="transfer-links">
            <label for="share-url">分享連結</label>
            <div class="transfer-url-field"><input id="share-url" readonly value={visibleResult.share} aria-label="分享連結"/><button onclick={() => copy(visibleResult!.share, 'share')} aria-label="複製分享連結" title="複製分享連結">{#if copied === 'share'}<Check size={16}/>{:else}<Copy size={16}/>{/if}</button></div>
            <div class="transfer-private"><LockKeyhole size={12}/><span>私人管理連結</span><button onclick={() => copy(visibleResult!.manage, 'manage')}>{copied === 'manage' ? '已複製' : '複製'}</button><a href={visibleResult.manage} aria-label="開啟私人管理連結" title="開啟私人管理連結"><ArrowUpRight size={14}/></a></div>
            <p class="transfer-private-hint">請保管管理連結，只有持有者能刪除檔案。</p>
          </div>
          {#if visibleResult.qr}<img class="transfer-qr" src={visibleResult.qr} width="88" height="88" alt="分享連結 QR Code"/>{/if}
        </div>
        <button class="transfer-next" onclick={clearSelection} disabled={busy}>繼續分享下一個檔案 <ArrowRight size={14}/></button>
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
    {#if status && !status.uploadsEnabled}<div class="notice">目前暫停上傳。現有分享連結仍可正常使用。</div>{/if}
    {#if file && !result && status?.uploadsEnabled}
      <div class="transfer-auth">
        <label for="invite">Beta 邀請碼 <span>僅供受邀測試者</span></label>
        <input id="invite" type="password" bind:value={invite} placeholder="輸入你的邀請碼" autocomplete="off" disabled={busy}/>
        {#if status.siteKey}<Turnstile siteKey={status.siteKey} onToken={v => verification = v} {revision}/>{:else}<p class="error-text">管理員尚未設定 Turnstile，暫時無法上傳。</p>{/if}
        <button class="transfer-send" disabled={busy || !verification || !invite} onclick={start}><span>{stage === 'preparing' ? '準備安全上傳…' : busy ? (progress >= 99 ? '確認儲存中…' : `正在上傳 ${progress}%`) : stage === 'error' ? '重新傳送' : '開始傳送'}</span><ArrowRight size={16}/></button>
        {#if stage === 'error' && (!verification || !invite)}<p class="transfer-retry-hint">確認邀請碼並重新完成人機驗證後，即可重試。</p>{/if}
      </div>
    {/if}
    {#if error && (!file || stage !== 'error')}<p class="transfer-error-notice" role="alert">{error}</p>{/if}
    <div class="transfer-capacity">
      <div><span class="transfer-capacity-label"><i></i>共享空間</span>{#if status}<span class="transfer-capacity-value">剩餘 {formatBytes(Math.max(0, status.capacity - status.occupied))}<span> / {formatBytes(status.capacity)}</span></span>{:else if statusError}<button onclick={load} class="transfer-load-retry">重新取得容量 <RefreshCw size={12}/></button>{:else}<span class="transfer-loading">正在取得容量…</span>{/if}</div>
      <div class="transfer-capacity-track"><div style:width={`${status ? Math.min(100, status.occupied / status.capacity * 100) : 0}%`}></div></div>
      {#if statusError}<p class="transfer-capacity-error" role="alert">{statusError}</p>{:else}<p>所有人共用的小空間，謝謝你溫柔使用。</p>{/if}
    </div>
  </section>
  <div class="transfer-trust"><span><LockKeyhole size={13}/>免登入</span><i></i><span><Clock3 size={13}/>最長 24 小時</span><i></i><span><ShieldCheck size={13}/>私人儲存</span></div>
  <p class="transfer-privacy">連結只交給對的人。檔案未端對端加密，請勿上傳機密資料。</p>
</div>
