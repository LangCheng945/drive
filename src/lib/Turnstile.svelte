<script lang="ts">
  import { onMount } from 'svelte';
  let { siteKey, onToken, revision = 0 }: { siteKey: string; onToken: (v: string) => void; revision?: number } = $props();
  let el: HTMLDivElement;
  let widget = $state<string>();
  let loadError = $state(false);
  onMount(() => {
    let stopped = false;
    const render = () => {
      if (stopped || !window.turnstile) return;
      widget = window.turnstile.render(el, { sitekey: siteKey, action: 'upload', theme: 'auto', callback: (v: string) => onToken(v), 'expired-callback': () => onToken(''), 'error-callback': () => { onToken(''); loadError = true; } });
    };
    let script: HTMLScriptElement | undefined;
    if (window.turnstile) render();
    else { script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.onload = render; script.onerror = () => { loadError = true; }; document.head.append(script); }
    return () => { stopped = true; if (widget) window.turnstile?.remove(widget); script?.remove(); };
  });
  $effect(() => { if (revision && widget) { window.turnstile?.reset(widget); onToken(''); loadError = false; } });
</script>
<div class="turnstile"><div bind:this={el}></div>{#if loadError}<p class="error-text" role="alert">驗證載入失敗，請重新整理或檢查網路。</p>{/if}</div>
