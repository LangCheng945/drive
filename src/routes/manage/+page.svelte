<script lang="ts">
  import { onMount } from 'svelte';
  import { Trash2, LockKeyhole, ArrowLeft, CheckCircle2 } from '@lucide/svelte';
  import { api, formatBytes, formatDate } from '#lib/ui.ts';
  let secret = ''; let info = $state<{ name: string; size: number; state: string; expiresAt: number }>();
  let loading = $state(true); let busy = $state(false); let error = $state(''); let confirmDelete = $state(false); let deleted = $state(false);
  onMount(() => { secret = location.hash.slice(1); if (!secret) { error = '私人管理連結不完整，請使用上傳後提供的原始連結。'; loading = false; return; } api<typeof info>(`/api/manage/${secret}`).then(v => { info = v; deleted = v?.state === 'deleted'; }).catch(e => error = e.message).finally(() => loading = false); });
  async function remove() { busy = true; error = ''; try { await api(`/api/manage/${secret}`, { method: 'DELETE' }); deleted = true; } catch (e) { error = (e as Error).message; } finally { busy = false; } }
</script>
<svelte:head><title>私人管理 — LangCheng Drive</title><meta name="robots" content="noindex,nofollow"/></svelte:head>
<div class="utility-page"><a class="back-link" href="/"><ArrowLeft size={16}/> 回到首頁</a><section class="utility-card">{#if loading}<div class="spinner"></div><h1>正在讀取檔案…</h1>{:else if deleted}<CheckCircle2 size={36}/><h1>檔案已刪除。</h1><p>分享連結已失效，空間已歸還。</p><a class="button primary" href="/">分享下一個檔案</a>{:else if info}<LockKeyhole size={32}/><div class="eyebrow">PRIVATE MANAGEMENT</div><h1 class="file-name">{info.name}</h1><p>{formatBytes(info.size)} · {info.state === 'ready' ? '可供領取' : '已領取或等待清理'}</p><small>有效至 {formatDate(info.expiresAt)}</small><div class="notice">這是私人管理連結。任何持有此連結的人都可以刪除檔案，請勿公開分享。</div>{#if confirmDelete}<p>確定立即永久刪除此檔案？</p><div class="confirm-actions"><button class="button secondary" disabled={busy} onclick={() => confirmDelete = false}>取消</button><button class="button danger" disabled={busy} onclick={remove}>{busy ? '正在刪除…' : '確認刪除'}</button></div>{:else}<button class="button danger full" onclick={() => confirmDelete = true}><Trash2 size={17}/> 立即刪除檔案</button>{/if}{/if}{#if error}<div class="notice error" role="alert">{error}</div>{/if}</section></div>
