<script lang="ts">
  import { File, FileImage, FileVideo, FileArchive, FileText, CheckCircle2, AlertCircle, RotateCcw, X, LoaderCircle, Link } from '@lucide/svelte';
  import { formatBytes } from './ui';
  let { name, size, progress = 0, status, message = '', onRemove, onRetry, onView }: {
    name: string; size: number; progress?: number;
    status: 'ready' | 'preparing' | 'uploading' | 'success' | 'error';
    message?: string; onRemove?: () => void; onRetry?: () => void; onView?: () => void;
  } = $props();
  const extension = $derived(name.split('.').pop()?.toUpperCase() || 'FILE');
  const kind = $derived(/\.(png|jpe?g|gif|webp|avif|heic)$/i.test(name) ? 'image' : /\.(mp4|mov|webm|mkv)$/i.test(name) ? 'video' : /\.(zip|7z|rar|tar|gz)$/i.test(name) ? 'archive' : /\.(pdf|txt|md|csv|docx)$/i.test(name) ? 'text' : 'file');
  const active = $derived(status === 'preparing' || status === 'uploading');
</script>

<article class="transfer-file" class:is-success={status === 'success'} class:is-error={status === 'error'} class:is-active={active}>
  <div class="transfer-file-icon" aria-hidden="true">
    {#if kind === 'image'}<FileImage size={19}/>{:else if kind === 'video'}<FileVideo size={19}/>{:else if kind === 'archive'}<FileArchive size={19}/>{:else if kind === 'text'}<FileText size={19}/>{:else}<File size={19}/>{/if}
  </div>
  <div class="transfer-file-body">
    <div class="transfer-file-heading">
      <strong title={name}>{name}</strong>
      <div class="transfer-file-actions">
        {#if status === 'success'}<CheckCircle2 size={14} class="transfer-success-mark" aria-label="上傳成功"/>{:else if status === 'error'}<AlertCircle size={14} class="transfer-error-mark" aria-label="上傳失敗"/>{:else if active}<LoaderCircle size={14} class="transfer-spinner" aria-label="上傳處理中"/>{/if}
        {#if onView}<button type="button" onclick={onView} aria-label={`查看 ${name} 的分享連結`} title="查看分享連結"><Link size={14}/></button>{/if}
        {#if onRetry}<button type="button" onclick={onRetry} aria-label={`重試上傳 ${name}`} title="重試上傳"><RotateCcw size={14}/></button>{/if}
        {#if onRemove}<button type="button" onclick={onRemove} aria-label={active ? `取消上傳 ${name}` : `移除 ${name} 的本次紀錄`} title={active ? '取消上傳' : '移除列表紀錄（不會刪除已上傳的檔案）'}><X size={14}/></button>{/if}
      </div>
    </div>
    <div class="transfer-file-meta"><span>{extension} · {formatBytes(size)}</span><span class="transfer-file-state">{status === 'success' ? '上傳完成' : status === 'error' ? '上傳失敗' : status === 'preparing' ? '正在準備上傳…' : status === 'uploading' ? (progress >= 99 ? '確認儲存中…' : `${progress}%`) : '等待上傳'}</span></div>
    <progress class="transfer-progress" value={status === 'success' ? 100 : progress} max="100" aria-label={`${name} 上傳進度`}></progress>
    {#if status === 'error' && message}<p class="transfer-file-error" role="alert">{message}</p>{/if}
  </div>
</article>
