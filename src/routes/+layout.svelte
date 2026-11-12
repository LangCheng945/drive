<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { Moon, Sun } from '@lucide/svelte';
  let { children } = $props();
  let dark = $state(false);
  onMount(() => {
    dark = localStorage.getItem('theme') !== 'light';
    document.documentElement.classList.toggle('dark', dark);
  });
  function toggle() { dark = !dark; document.documentElement.classList.toggle('dark', dark); localStorage.setItem('theme', dark ? 'dark' : 'light'); }
</script>
<div class="app-shell">
  <main>{@render children()}</main>
  <footer class="site-footer"><span>LangCheng Drive · v0.1.0</span><div class="footer-controls"><a class="icon-button" href="https://github.com/LangCheng945/drive" target="_blank" rel="noreferrer" aria-label="GitHub 原始碼" title="GitHub 原始碼"><img class="github-mark" src="/github-mark.svg" width="18" height="18" alt=""/></a><button class="icon-button" onclick={toggle} aria-label={dark ? '切換淺色模式' : '切換深色模式'}>{#if dark}<Sun size={16} />{:else}<Moon size={16} />{/if}</button></div></footer>
</div>

<style>
  .footer-controls { margin-left: auto; display: flex; align-items: center; gap: 14px; }
  .github-mark { display: block; }
  :global(.dark) .github-mark { filter: invert(1); }
  .site-footer { padding: 12px 0; font-size: 10px; gap: 12px; }
  @media (max-width: 600px) { .site-footer { font-size: 9px; } }
</style>
