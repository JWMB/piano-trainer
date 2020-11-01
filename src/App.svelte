<style>
  main {
    @apply p-4;
  }
  h1,
  p {
    @apply text-gray-600;
  }
</style>

<script lang="ts">
import TailwindCSS from './style/TailwindCSS.svelte';
import { onMount } from 'svelte';
import { App } from './app';
export let name;

let app = new App();

window.oncontextmenu = e => {
    e.preventDefault();
    e.stopPropagation();
    return false;
};

onMount(async () => {
  await app.init();
  app.createCpuPianoKeyboard(document.getElementById("cpuKeyboard"));
  app.createUserPianoKeyboard(document.getElementById("userKeyboard"));
});

function stop() {
  app.stop();
}
async function presentProblem() {
  await app.presentProblem();
}

</script>

<TailwindCSS />
<main>
  <h1 class="text-3xl font-bold">{name}</h1>
  <button on:click="{presentProblem}">Start</button>
  <button on:click="{stop}">Stop</button>
  <h2 id="yourTurn" style="visibility:hidden;" class="text-2xl font-bold">Your turn</h2>
  <div id="beat">.</div>
  <div id="cpuKeyboard"></div>
  <h1 id="score" class="text-3xl font-bold">0</h1>
  <div id="userKeyboard"></div>
</main>
