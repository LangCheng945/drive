<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { Moon, Sun, GitFork, ArrowUpRight } from '@lucide/svelte';
  let { children } = $props();
  let dark = $state(false);
  onMount(() => {
    dark = localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  });
  function toggle() { dark = !dark; document.documentElement.classList.toggle('dark', dark); localStorage.setItem('theme', dark ? 'dark' : 'light'); }
</script>
<div class="app-shell">
  <header class="site-header">
    <a href="/" class="brand" aria-label="LangCheng Drive 首頁"><img src="/favicon.svg" width="34" height="34" alt="" /><span>LangCheng <span class="brand-light">Drive</span></span></a>
    <nav aria-label="主要導覽"><span class="beta-pill"><i></i> Limited Beta</span><a class="icon-button github-nav" href="https://github.com/LangCheng945/drive" target="_blank" rel="noreferrer" aria-label="GitHub 原始碼"><GitFork size={19} /></a><button class="icon-button" onclick={toggle} aria-label={dark ? '切換淺色模式' : '切換深色模式'}>{#if dark}<Sun size={19} />{:else}<Moon size={19} />{/if}</button></nav>
  </header>
  <main>{@render children()}</main>
  <footer class="site-footer"><span>讓分享輕一點，讓隱私多一點。</span><a href="https://github.com/LangCheng945/drive" target="_blank" rel="noreferrer">開源，為每個人而生 <ArrowUpRight size={14}/></a><span class="version">v0.1.0 · Made by LangCheng</span></footer>
</div>
