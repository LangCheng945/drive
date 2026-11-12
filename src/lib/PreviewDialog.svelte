<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Download } from '@lucide/svelte';
  import { previewType, type PreviewItem } from './preview';
  let { item, onClose, onClaim }: { item: PreviewItem; onClose: () => void; onClaim?: () => void } = $props();
  let dialog = $state<HTMLDialogElement>(null!);
  let loading = $state(false), started = $state(false), error = $state(''), url = $state(''), text = $state(''), truncated = $state(false);
  const type = $derived(previewType(item.name));
  const abort = new AbortController();
  onMount(() => {
    dialog.showModal();
    if (item.mode !== 'once') void load();
    return () => { abort.abort(); if (url) URL.revokeObjectURL(url); };
  });
  async function load() {
    if (loading || started) return;
    started = true; loading = true; error = '';
    try {
      const response = await fetch(`${item.endpoint}/download`,{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal});
      if (!response.ok) { const data = await response.json(); throw new Error(data.message || '無法載入預覽。'); }
      if (item.mode === 'once') onClaim?.();
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      if (!type) throw new Error('此格式不支援預覽。');
      url = URL.createObjectURL(new Blob([blob],{type:type.mime}));
      if (type.kind === 'text') { text = await blob.slice(0,200000).text(); truncated = blob.size > 200000; }
    } catch (e) { if (!abort.signal.aborted) error = (e as Error).message; }
    finally { loading = false; }
  }
</script>
<dialog bind:this={dialog} class="file-preview-dialog" aria-label={`${item.name} 預覽`} onclose={onClose}>
  <div class="file-preview-heading"><strong>{item.name}</strong><div>{#if url}<a class="icon-button" href={url} download={item.name} aria-label="下載預覽中的檔案" title="下載"><Download size={18}/></a>{/if}<button class="icon-button" onclick={onClose} aria-label="關閉預覽"><X size={18}/></button></div></div>
  {#if !started}<div class="file-preview-confirm">{#if item.thumbnail}<img src={item.thumbnail} alt="檔案縮圖"/>{/if}<p>預覽原檔會使用唯一一次領取機會，關閉後無法重新取得。</p><button class="button primary" onclick={load}>預覽並領取</button></div>
  {:else if loading}<p class="file-preview-message" role="status">載入預覽中…</p>
  {:else if error}<p class="file-preview-message error-text" role="alert">{error}</p>
  {:else if type?.kind === 'image'}<img class="file-preview-image" src={url} alt={item.name}/>
  {:else if type?.kind === 'video'}<video class="file-preview-media" src={url} controls playsinline><track kind="captions"/>瀏覽器不支援此影片格式，請下載檔案。</video>
  {:else if type?.kind === 'audio'}<audio class="file-preview-media" src={url} controls>瀏覽器不支援此音訊格式，請下載檔案。</audio>
  {:else if type?.kind === 'text'}{#if truncated}<p class="file-preview-message">僅顯示前 200 KB。</p>{/if}<pre class="file-preview-text">{text}</pre>{/if}
</dialog>

<style>
.file-preview-dialog { width:min(920px,94vw); max-height:90dvh; padding:0; border:1px solid var(--border); border-radius:16px; background:var(--surface,var(--bg)); color:var(--text); overflow:auto; }
.file-preview-dialog::backdrop { background:#0009; backdrop-filter:blur(5px); }
.file-preview-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px; border-bottom:1px solid var(--border); }
.file-preview-heading strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; }
.file-preview-heading > div { display:flex; gap:8px; }
.file-preview-image { display:block; width:100%; height:auto; max-height:72dvh; object-fit:contain; background:#181818; }
.file-preview-media { display:block; width:100%; max-height:72dvh; margin:20px auto; }
.file-preview-text { padding:20px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font-size:13px; }
.file-preview-message,.file-preview-confirm { padding:24px; text-align:center; font-size:14px; }
.file-preview-confirm img { width:120px; height:120px; object-fit:contain; }
.file-preview-confirm p { margin:16px 0; }
</style>