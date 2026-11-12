<script lang="ts">
  import { onMount } from 'svelte';
  import { Upload, ArrowUpRight, ArrowRight, Zap, Clock3, LockKeyhole, Link, Check, Copy, File as FileIcon, X, ShieldCheck, RefreshCw, CheckCircle2 } from '@lucide/svelte';
  import QRCode from 'qrcode';
  import Turnstile from '#lib/Turnstile.svelte';
  import { api, formatBytes, formatDate, messages } from '#lib/ui.ts';
  type Status = { capacity: number; maxFile: number; retention: number; occupied: number; uploadsEnabled: boolean; siteKey: string };
  let status = $state<Status>();
  let statusError = $state('');
  let file = $state<File>();
  let mode = $state<'once' | 'day'>('once');
  let invite = $state(''); let verification = $state(''); let revision = $state(0);
  let dragging = $state(false); let busy = $state(false); let progress = $state(0); let error = $state('');
  let result = $state<{ share: string; manage: string; expiresAt: number }>();
  let qr = $state(''); let copied = $state(''); let input = $state<HTMLInputElement>(null!); let xhr: XMLHttpRequest | undefined;
  const text = messages['zh-Hant'];
  async function load() { statusError = ''; try { status = await api<Status>('/api/status'); } catch (e) { statusError = (e as Error).message; } }
  onMount(() => { void load(); return () => xhr?.abort(); });
  function choose(f?: File) {
    if (busy) return; error = ''; result = undefined; qr = ''; file = undefined;
    if (!f) return;
    if (!f.size) { error = '請選擇非空白檔案。'; return; }
    if (status && f.size > status.maxFile) { error = `單檔上限為 ${formatBytes(status.maxFile)}。`; return; }
    file = f;
  }
  async function start() {
    if (!file || !status || busy) return;
    busy = true; error = ''; progress = 0;
    let reservation: { upload: string; share: string; manage: string; expiresAt: number } | undefined;
    try {
      const created = await api<{ upload: string; share: string; manage: string; expiresAt: number }>('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, size: file.size, mode, invite, turnstile: verification }) });
      reservation = created;
      await new Promise<void>((resolve, reject) => {
        xhr = new XMLHttpRequest(); xhr.open('PUT', `/api/uploads/${reservation!.upload}`); xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.timeout = 125000;
        xhr.upload.onprogress = e => { if (e.lengthComputable) progress = Math.min(99, Math.round(e.loaded / e.total * 100)); };
        xhr.onerror = () => reject(new Error('網路中斷，請重試。預留空間會自動釋放。'));
        xhr.onabort = () => reject(new Error('已取消上傳。預留空間會自動釋放。'));
        xhr.ontimeout = () => reject(new Error('上傳逾時，請重新嘗試。'));
        xhr.onload = () => { if (xhr!.status >= 200 && xhr!.status < 300) resolve(); else { try { reject(new Error(JSON.parse(xhr!.responseText).message)); } catch { reject(new Error('上傳失敗，請重試。')); } } };
        xhr.send(file);
      });
      progress = 100;
      result = { share: `${location.origin}/s/${created.share}`, manage: `${location.origin}/manage#${created.manage}`, expiresAt: created.expiresAt };
      qr = await QRCode.toDataURL(result.share, { width: 180, margin: 1, color: { dark: '#182234', light: '#ffffff' } });
    } catch (e) {
      error = (e as Error).message;
      // If the upload succeeded but the response was lost, revoke the capability.
      if (reservation && !result) { try { await api(`/api/manage/${reservation.manage}`, { method: 'DELETE' }); } catch { /* cleanup retries */ } }
    } finally { busy = false; verification = ''; revision++; void load(); }
  }
  async function copy(value: string, label: string) { try { await navigator.clipboard.writeText(value); copied = label; setTimeout(() => copied = '', 2200); } catch { error = '無法使用剪貼簿，請手動複製連結。'; } }
</script>

<svelte:head><title>LangCheng Drive — 分享，然後放下。</title><meta name="description" content="免登入、隱私優先的臨時檔案交換。一次性快傳或 24 小時分享，簡單、快速、不留多餘痕跡。" /></svelte:head>

<div class="home">
  <div class="intro"><div class="eyebrow"><span class="tiny-line"></span> LESS FRICTION. MORE PRIVACY.</div><h1>分享，然後<span>放下。</span></h1><p>檔案只是路過，不必留下。<br class="mobile-break" />免登入，讓傳遞回到最簡單的樣子。</p></div>
  <div class="workspace">
    <section class="upload-card" aria-label="檔案分享">
      <div class="card-top"><span><span class="step-number">01</span> 選擇分享方式</span><LockKeyhole size={15}/></div>
      <div class="mode-switch" role="group" aria-label="分享方式">
        <button class:active={mode === 'once'} disabled={busy || !!result} onclick={() => mode = 'once'} aria-pressed={mode === 'once'}><Zap size={19}/><span><strong>{text.once}</strong><small>領取一次，即刻告別</small></span>{#if mode === 'once'}<Check size={16} class="mode-check"/>{/if}</button>
        <button class:active={mode === 'day'} disabled={busy || !!result} onclick={() => mode = 'day'} aria-pressed={mode === 'day'}><Clock3 size={19}/><span><strong>{text.day}</strong><small>限時連結，自由傳遞</small></span>{#if mode === 'day'}<Check size={16} class="mode-check"/>{/if}</button>
      </div>
      {#if result}
        <div class="success-pane"><div class="success-icon"><CheckCircle2 size={28}/></div><h2>準備好了，傳給對的人。</h2><p>有效至 {formatDate(result.expiresAt)}</p><div class="share-row"><input readonly value={result.share} aria-label="分享連結"/><button class="icon-button" onclick={() => copy(result!.share, 'share')} aria-label="複製分享連結">{#if copied === 'share'}<Check size={18}/>{:else}<Copy size={18}/>{/if}</button></div>{#if qr}<img class="qr" src={qr} width="140" height="140" alt="分享連結 QR Code"/>{/if}<div class="private-link"><LockKeyhole size={15}/><span>私人管理連結，請自行保管</span><button onclick={() => copy(result!.manage, 'manage')}>{copied === 'manage' ? '已複製' : '複製'}</button></div><a href={result.manage} class="subtle-link">開啟管理連結 <ArrowUpRight size={14}/></a><button class="button secondary full" onclick={() => { result = undefined; file = undefined; }}>再分享一個檔案 <ArrowRight size={16}/></button></div>
      {:else}
        <div class="drop-zone" class:dragging ondragover={e => { e.preventDefault(); dragging = true; }} ondragleave={() => dragging = false} ondrop={e => { e.preventDefault(); dragging = false; if (e.dataTransfer?.files.length !== 1) { error = '請一次選擇一個檔案。'; return; } choose(e.dataTransfer.files[0]); }} role="region" aria-label="拖曳檔案上傳區域">
          <input bind:this={input} type="file" class="sr-only" tabindex="-1" onchange={() => choose(input.files?.[0])} disabled={busy}/>
          {#if file}<div class="file-icon"><FileIcon size={28}/></div><h2 class="file-name">{file.name}</h2><p>{formatBytes(file.size)} <span class="separator">·</span> {busy ? `${progress}%` : '已準備好上傳'}</p>{#if busy}<progress value={progress} max="100" aria-label="上傳進度"></progress><button class="text-button" onclick={() => xhr?.abort()}>取消上傳</button>{:else}<button class="text-button" onclick={() => { file = undefined; input.value = ''; }}><X size={14}/> 移除檔案</button>{/if}
          {:else}<div class="upload-symbol"><Upload size={29} strokeWidth={1.7}/><span class="mini-plus">+</span></div><h2>把檔案拖到這裡</h2><p>或是，選一個你想分享的檔案</p><button class="button primary select-file" onclick={() => input.click()} disabled={!status?.uploadsEnabled}>選擇檔案 <ArrowUpRight size={16}/></button><small>單檔最高 {formatBytes(status?.maxFile ?? 50000000)} <span class="separator">·</span> 最長保留 {Math.round((status?.retention ?? 86400) / 3600)} 小時</small>{/if}
        </div>
        <div class="mode-note"><ShieldCheck size={16}/><p>{mode === 'once' ? '只允許一次成功領取。下載中斷也可能消耗唯一機會。' : '有效期限內可重複下載，到期後立即停止存取。'}</p></div>
        {#if status && !status.uploadsEnabled}<div class="notice">目前暫停上傳。現有分享連結仍可正常使用。</div>{/if}
        {#if file && status?.uploadsEnabled}<div class="upload-controls"><label for="invite">Beta 邀請碼 <span>僅供受邀測試者</span></label><input id="invite" type="password" bind:value={invite} placeholder="輸入你的邀請碼" autocomplete="off" disabled={busy}/>{#if status.siteKey}<Turnstile siteKey={status.siteKey} onToken={v => verification = v} {revision}/>{:else}<p class="error-text">管理員尚未設定 Turnstile，暫時無法上傳。</p>{/if}<button class="button primary full" disabled={busy || !verification || !invite} onclick={start}>{busy ? `正在上傳 ${progress}%` : text.upload}<ArrowRight size={17}/></button></div>{/if}
      {/if}
      {#if error}<div class="notice error" role="alert">{error}</div>{/if}
      <div class="capacity"><div><span class="capacity-dot"></span><span>共享空間</span>{#if status}<strong>剩餘 {formatBytes(Math.max(0, status.capacity - status.occupied))}<span> / {formatBytes(status.capacity)}</span></strong>{:else if statusError}<button class="text-button" onclick={load}>無法取得容量 <RefreshCw size={13}/></button>{:else}<span class="loading-label">正在取得容量…</span>{/if}</div><div class="capacity-track"><div style:width={`${status ? Math.min(100, status.occupied / status.capacity * 100) : 0}%`}></div></div><small>所有人共用的小空間，謝謝你溫柔使用。</small></div>
    </section>
    <aside class="details"><div class="detail-header"><span class="detail-line"></span><span>JUST PASSING THROUGH</span></div><h2>只留下連結。<br/>不留下負擔。</h2><p class="detail-intro">為那些「傳給你就好」的時刻而生。</p><div class="feature"><div><LockKeyhole size={19}/></div><section><h3>沒有帳號，也能分享</h3><p>不需要註冊，不多收一份個人資料。<br/>Beta 期間以邀請碼開放上傳。</p></section></div><div class="feature"><div><Clock3 size={19}/></div><section><h3>短暫停留，自動告別</h3><p>最長 24 小時。到期立即拒絕存取，<br/>接著由背景工作清理檔案。</p></section></div><div class="feature"><div><Link size={19}/></div><section><h3>你的連結，你決定</h3><p>沒有公開列表。持有連結才能領取，<br/>也可以隨時用私人管理連結刪除。</p></section></div><div class="privacy-note"><ShieldCheck size={18}/><p>隱私優先，透明開源。<br/><span>檔案未端對端加密，請勿上傳機密資料。</span></p></div></aside>
  </div>
  <div class="bottom-note"><span></span> A LITTLE SPACE FOR YOUR NEXT HANDOFF <span></span></div>
</div>
