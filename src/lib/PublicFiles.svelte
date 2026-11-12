<script lang="ts">
  import { onMount } from 'svelte';
  import { File, RefreshCw, ArrowUpRight } from '@lucide/svelte';
  import { api, formatBytes, formatDate } from './ui';
  import PreviewDialog from './PreviewDialog.svelte';
  import { previewType, type PreviewItem } from './preview';
  let { refresh = 0 }: { refresh?: number } = $props();
  type Entry = { publicId: string; name: string; size: number; mode: 'once' | 'day'; expiresAt: number; thumbnail: string | null };
  let preview = $state<PreviewItem | null>(null);
  let files = $state<Entry[]>([]);
  let cursor = $state<string | null>(null);
  let loading = $state(true);
  let error = $state('');
  let active: AbortController | undefined;
  let mounted = $state(false);
  async function load(append = false) {
    active?.abort();
    const request = new AbortController(); active = request;
    loading = true; error = '';
    try {
      const result = await api<{ files: Entry[]; nextCursor: string | null }>(`/api/public${append && cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`, { signal: request.signal });
      if (request.signal.aborted) return;
      files = append ? [...files, ...result.files.filter(f => !files.some(old => old.publicId === f.publicId))] : result.files;
      cursor = result.nextCursor;
    } catch (e) { if (!request.signal.aborted) error = (e as Error).message; }
    finally { if (active === request) loading = false; }
  }
  onMount(() => { mounted = true; return () => active?.abort(); });
  $effect(() => { void refresh; if (mounted) void load(); });
</script>

<section class="public-files" aria-labelledby="public-files-title">
  <div class="public-files-heading"><h2 id="public-files-title">公開檔案</h2><button class="icon-button" disabled={loading} onclick={() => load()} aria-label="重新整理公開檔案" title="重新整理"><RefreshCw size={15}/></button></div>
  {#if files.length}
    <ul class="public-file-list">
      {#each files as file (file.publicId)}
        <li>{#if previewType(file.name)}<button class="public-file-thumbnail" onclick={() => preview = {name:file.name,mode:file.mode,endpoint:`/api/public/${file.publicId}`,thumbnail:file.thumbnail}} aria-label={`預覽 ${file.name}`} title="預覽">{#if file.thumbnail}<img src={file.thumbnail} alt="" loading="lazy"/>{:else}<File size={20}/>{/if}</button>{:else}<div class="public-file-thumbnail"><File size={20}/></div>{/if}<a href={`/p/${file.publicId}`}><span class="public-file-content"><strong title={file.name}>{file.name}</strong><span>{formatBytes(file.size)} · {file.mode === 'once' ? '一次性下載' : '可重複下載'}</span><small>到期：{formatDate(file.expiresAt)}</small></span><ArrowUpRight size={15}/></a></li>
      {/each}
    </ul>
  {:else if !loading && !error}<p class="public-files-message">目前沒有公開檔案。</p>{/if}
  {#if loading}<p class="public-files-message" role="status">載入中…</p>{/if}
  {#if error}<p class="public-files-error" role="alert">{error}</p><button class="public-files-more" onclick={() => load(!!files.length)}>重試</button>
  {:else if cursor}<button class="public-files-more" disabled={loading} onclick={() => load(true)}>載入更多</button>{/if}
</section>
{#if preview}<PreviewDialog item={preview} onClose={() => { preview = null; void load(); }}/>{/if}
