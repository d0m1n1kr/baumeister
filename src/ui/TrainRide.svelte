<script lang="ts">
  // Eisenbahn-Fahrt: Bei jedem Positionswechsel fährt der Zug sichtbar aus
  // einem Tunnel quer über den Bildschirm und im gegenüberliegenden Tunnel
  // wieder hinaus. Hält er an einem Bahnhof, stoppt er in der Mitte, pfeift
  // und rollt erst dann weiter. Rein aus Zustands-Diffs abgeleitet —
  // funktioniert damit identisch am Einzelgerät, beim Host und bei Gästen.
  import { game } from '../store/gameStore.svelte';
  import { catalog } from '../data';
  import { trainStopPlayer } from '../engine/game';
  import { RESOURCE_CSS } from './helpers';
  import { sfx } from './sound';
  import { t } from '../i18n';
  import type { Resource } from '../engine/types';

  type Ride = { wagons: (Resource | null)[]; stopName: string | null };

  const reduceMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ride = $state<Ride | null>(null);
  let prevPos: number | null = null;
  let rideTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const st = game.state;
    const pos = st?.train?.pos ?? null;
    const prev = prevPos;
    prevPos = pos;
    if (st == null || pos == null || prev == null || pos === prev) return;

    const stopAt = trainStopPlayer(st, catalog);
    const stopName = stopAt != null ? st.players[stopAt].name : null;
    sfx.play('trainMove');
    if (stopName) setTimeout(() => sfx.play('trainStop'), reduceMotion ? 200 : 1500);
    if (reduceMotion) return; // Ton ja, Fahrt nein

    ride = { wagons: [...st.train!.wagons], stopName };
    clearTimeout(rideTimer);
    rideTimer = setTimeout(() => (ride = null), stopName ? 4600 : 2600);
  });
</script>

{#if ride}
  <div class="rail" aria-hidden="true">
    <div class="tunnel left"></div>
    <div class="tunnel right"></div>
    <div class="convoy" class:stopping={ride.stopName != null}>
      {#if ride.stopName}
        <span class="stopSign">🚉 {t.trainAt(ride.stopName)}</span>
      {/if}
      <div class="cars">
        <span class="loco">🚂</span>
        {#each ride.wagons as w}
          <span class="car">
            {#if w}<span class="load" style="background: {RESOURCE_CSS[w]}"></span>{/if}
          </span>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .rail {
    position: fixed;
    inset: auto 0 12vh 0;
    height: 72px;
    pointer-events: none;
    z-index: 120;
    overflow: hidden;
  }
  /* Tunnelportale an beiden Rändern — der Zug verschwindet „in" ihnen */
  .tunnel {
    position: absolute;
    bottom: 0;
    width: 46px;
    height: 58px;
    background: #2c3a4d;
    border: 3px solid #46586f;
    border-bottom: none;
    border-radius: 26px 26px 0 0;
    animation: tunnelIn 400ms ease-out;
    z-index: 2;
  }
  .tunnel.left { left: -6px; }
  .tunnel.right { right: -6px; }
  @keyframes tunnelIn { from { translate: 0 70px; } }

  .convoy {
    position: absolute;
    bottom: 6px;
    left: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    animation: drive 2.5s linear forwards;
  }
  .convoy.stopping { animation: driveStop 4.5s ease-in-out forwards; }
  /* Fahrt von links nach rechts, translate relativ zur eigenen Breite +
     Bildschirmbreite über die Keyframes (100vw) */
  @keyframes drive {
    from { transform: translateX(-110%); }
    to { transform: translateX(100vw); }
  }
  @keyframes driveStop {
    0% { transform: translateX(-110%); }
    38% { transform: translateX(calc(50vw - 50%)); }
    62% { transform: translateX(calc(50vw - 50%)); }
    100% { transform: translateX(100vw); }
  }

  .cars { display: flex; align-items: flex-end; gap: 3px; }
  .loco { font-size: 34px; line-height: 1; transform: scaleX(-1); }
  .car {
    width: 26px;
    height: 18px;
    border-radius: 4px 4px 2px 2px;
    background: #6b4a35;
    border: 2px solid #3b3327;
    display: grid;
    place-items: center;
    margin-bottom: 2px;
  }
  .load {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid rgba(0, 0, 0, 0.4);
  }
  .stopSign {
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    background: var(--bg-panel);
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 2px 8px;
    white-space: nowrap;
    animation: signIn 300ms ease-out 1.5s backwards;
  }
  @keyframes signIn { from { opacity: 0; scale: 0.8; } }
</style>
