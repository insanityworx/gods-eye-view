<script setup>
import { computed, ref, watch } from 'vue';
import { t } from '../i18n/index.js';
import { useConquestStore } from '../ui/stores/conquest.js';
import TacticalView from './TacticalView.vue';
import { adjacent, COSTS } from './simulation.js';
const store = useConquestStore();
const mode = ref('conquest');
const armed = ref(false);
watch(
  () => store.selected,
  () => {
    armed.value = false;
  },
);
const game = computed(() => store.match);
const sector = computed(() => game.value.sectors[store.selected]);
const source = computed(() => game.value.sectors[store.origin]);
const player = computed(() => game.value.factions.player);
const owned = computed(
  () => game.value.sectors.filter((item) => item.owner === 'player').length,
);
const active = computed(
  () => !store.paused && !store.loading && game.value.status === 'playing',
);
const canMove = computed(
  () =>
    active.value &&
    source.value.owner === 'player' &&
    source.value.units > 1 &&
    adjacent(source.value.id, sector.value.id),
);
const canStrike = computed(
  () =>
    active.value &&
    sector.value.owner !== 'player' &&
    game.value.escalation >= 70 &&
    player.value.credits >= COSTS.strategic &&
    player.value.cooldown === 0,
);
const canBuild = (type) =>
  active.value &&
  sector.value.owner === 'player' &&
  player.value.credits >= COSTS[type] &&
  sector.value[type] < 3;
const training = computed(() =>
  game.value.orders.some(
    (order) => order.type === 'train' && order.target === sector.value.id,
  ),
);
const errors = computed(() => ({
  paused: t('Resume the match before issuing orders.'),
  funds: t('Insufficient credits.'),
  ownership: t('Select a sector you control.'),
  'invalid-move': t(
    'Select a neighbouring sector and leave one unit to defend.',
  ),
  production: t('A factory and an empty production queue are required.'),
  unavailable: t('This action is unavailable.'),
  maximum: t('Maximum building level reached.'),
  finished: t('The match has ended.'),
  'invalid-battle': t(
    'Deploy 1–24 units into a neighbouring hostile sector with at most 36 defenders.',
  ),
}));
const eventText = (event) =>
  ({
    start: t('Operation begins. Capture Ion HQ; defend Aster HQ.'),
    dispatch: t('Formation dispatched to {sector}.', { sector: event.sector }),
    capture: t('{sector} changed control.', { sector: event.sector }),
    repelled: t('Attack repelled at {sector}.', { sector: event.sector }),
    strategic: t('Strategic strike at {sector}. Emergency response strained.', {
      sector: event.sector,
    }),
  })[event.type];
function select(id) {
  armed.value = false;
  store.act('select', id);
}
function strike() {
  if (armed.value) {
    store.act('command', 'strategic');
    armed.value = false;
  } else armed.value = true;
}
function start() {
  armed.value = false;
  store.act('start', mode.value);
}
</script>

<template>
  <TacticalView v-if="store.battlefield" />
  <main
    class="campaign"
    :inert="store.battlefield ? true : undefined"
    :aria-hidden="store.battlefield ? true : undefined"
  >
    <div id="campaign-globe" aria-label="Campaign globe"></div>
    <div class="map-vignette"></div>
    <header class="campaign-header">
      <a class="wordmark" href="/"
        ><span class="eye-mark">◉</span
        ><span
          >{{ t('GOD’S EYE') }} <small>{{ t('CONQUEST') }}</small></span
        ></a
      >
      <div class="operation-label"
        ><span class="status-light"></span>{{ t('NORTH ATLANTIC THEATRE')
        }}<small>{{ t('FICTIONAL CAMPAIGN · SINGLE PLAYER') }}</small></div
      >
      <div class="clock"
        >{{ String(Math.floor(game.tick / 60)).padStart(2, '0') }}:{{
          String(game.tick % 60).padStart(2, '0')
        }}
        <button
          class="quiet"
          :disabled="store.loading || game.status === 'finished'"
          @click="store.act('pause')"
          >{{ store.paused ? t('Resume') : t('Pause') }}</button
        ></div
      >
    </header>

    <aside class="campaign-left">
      <section class="panel mission">
        <div class="eyebrow">{{ t('OPERATION / 001') }}</div>
        <h1>{{ t('A world to hold.') }}</h1>
        <p>{{
          t(
            'Build your base. Secure the corridor. Capture Ion HQ before the opposing force reaches Aster.',
          )
        }}</p>
        <label class="field-label" for="campaign-mode">{{
          t('RULES OF ENGAGEMENT')
        }}</label>
        <select id="campaign-mode" v-model="mode" :disabled="store.loading"
          ><option value="conquest">{{
            t('Conquest · conventional opening')
          }}</option
          ><option value="total-war">{{
            t('Total war · strategic weapons unlocked')
          }}</option></select
        >
        <button class="primary start" :disabled="store.loading" @click="start"
          >{{
            store.loading
              ? t('Capturing weather snapshot…')
              : game.tick
                ? t('Restart operation')
                : t('Launch operation')
          }}
          <span>↗</span></button
        >
        <p class="micro">{{
          t(
            'Launching replaces the current match. Multiplayer is planned; this build plays against AI.',
          )
        }}</p>
      </section>
      <section class="panel resources">
        <div
          ><span class="eyebrow">{{ t('CREDITS') }}</span
          ><strong>{{ player.credits }}<small> CR</small></strong></div
        >
        <div
          ><span class="eyebrow">{{ t('CONTROL') }}</span
          ><strong>{{ owned }}<small> / 9</small></strong></div
        >
        <div
          ><span class="eyebrow">{{ t('STABILITY') }}</span
          ><strong>{{ player.reputation }}<small>%</small></strong></div
        >
      </section>
      <section class="panel situation">
        <div class="section-heading"
          ><span class="eyebrow">{{ t('THEATRE CONDITIONS') }}</span
          ><span class="source-tag">{{
            game.snapshot.source === 'synthetic'
              ? t('SYNTHETIC')
              : t('CAPTURED WEATHER')
          }}</span></div
        >
        <div class="weather-value"
          >{{ game.snapshot.windKph }} <small>{{ t('km/h wind') }}</small></div
        >
        <p>{{
          game.snapshot.source === 'synthetic'
            ? t(
                'Synthetic weather baseline. Launch attempts a fresh observation.',
              )
            : t('Open-Meteo observation at 51°N, 0°E. Frozen for this match.')
        }}</p>
        <time v-if="game.snapshot.observedAt">{{
          game.snapshot.observedAt
        }}</time>
        <p class="micro">{{
          t(
            'High wind increases fictional emergency-response strain. Population exposure is authored, not live. No real-world casualty or fallout prediction.',
          )
        }}</p>
      </section>
      <section class="panel escalation">
        <div class="section-heading"
          ><span class="eyebrow">{{ t('ESCALATION') }}</span
          ><b>{{ game.escalation }} / 100</b></div
        >
        <meter
          min="0"
          max="100"
          :value="game.escalation"
          :aria-label="t('Escalation')"
        ></meter>
        <p>{{
          t(
            'Combat raises tension. Strategic strikes unlock at 70, reduce stability and can trigger AI retaliation.',
          )
        }}</p>
      </section>
    </aside>

    <div class="theatre-caption"
      ><span class="crosshair">+</span
      ><span
        >{{ t('NORTH ATLANTIC')
        }}<small>{{ t('09 SECTORS / TWO FACTIONS / ONE FRONT') }}</small></span
      ></div
    >
    <div v-if="store.mapError" class="map-fallback">{{
      t('3D globe unavailable. Use the sector grid to play.')
    }}</div>
    <div
      v-if="store.paused && game.status === 'playing' && !store.loading"
      class="paused-badge"
      >{{
        game.tick === 0 ? t('AWAITING COMMAND') : t('OPERATION PAUSED')
      }}</div
    >
    <div v-if="game.status === 'finished'" class="result panel" role="status"
      ><div class="eyebrow">{{ t('OPERATION COMPLETE') }}</div
      ><h2>{{
        game.winner === 'player' ? t('Ion HQ secured.') : t('Aster HQ lost.')
      }}</h2
      ><p>{{ t('Launch a new operation to play again.') }}</p></div
    >

    <aside class="campaign-right">
      <section class="panel sector-panel">
        <div class="section-heading"
          ><span class="eyebrow">{{ t('SECTOR COMMAND') }}</span
          ><span :class="['owner-tag', sector.owner]">{{
            sector.owner === 'player'
              ? t('ALLIED')
              : sector.owner === 'enemy'
                ? t('HOSTILE')
                : t('NEUTRAL')
          }}</span></div
        >
        <h2
          >{{ sector.name
          }}<span v-if="sector.id === 0 || sector.id === 8">
            {{ t('HQ') }}</span
          ></h2
        >
        <div class="sector-stats"
          ><div
            ><strong>{{ sector.units }}</strong
            ><small>{{ t('UNITS') }}</small></div
          ><div
            ><strong>{{ sector.infrastructure }}%</strong
            ><small>{{ t('INFRASTRUCTURE') }}</small></div
          ><div
            ><strong>{{ sector.strain }}</strong
            ><small>{{ t('RELIEF STRAIN') }}</small></div
          ></div
        >
        <p class="micro">{{
          t('Exposure class {level}/3 · fictional scenario value', {
            level: sector.exposure,
          })
        }}</p>
        <template v-if="sector.owner === 'player'">
          <div class="eyebrow command-title">{{ t('BASE & PRODUCTION') }}</div>
          <button
            :disabled="
              !active || !sector.factory || training || player.credits < 40
            "
            @click="store.act('command', 'train')"
            ><span>{{
              training
                ? t('Training formation…')
                : t('Train 4 units · {seconds}s', {
                    seconds: 10 - sector.factory * 2,
                  })
            }}</span
            ><b>40 CR</b></button
          >
          <button
            :disabled="!canBuild('factory')"
            @click="store.act('command', 'factory')"
            ><span
              >{{ t('Factory') }}
              <small>{{
                t('Level {level}/3', { level: sector.factory })
              }}</small></span
            ><b>120 CR</b></button
          >
          <button
            :disabled="!canBuild('refinery')"
            @click="store.act('command', 'refinery')"
            ><span
              >{{ t('Refinery') }}
              <small>{{
                t('Level {level}/3', { level: sector.refinery })
              }}</small></span
            ><b>100 CR</b></button
          >
          <button
            :disabled="!canBuild('shield')"
            @click="store.act('command', 'shield')"
            ><span
              >{{ t('Defence grid') }}
              <small>{{
                t('Level {level}/3', { level: sector.shield })
              }}</small></span
            ><b>80 CR</b></button
          >
          <button
            :disabled="
              !active ||
              player.credits < 60 ||
              (sector.infrastructure === 100 && sector.strain === 0)
            "
            @click="store.act('command', 'relief')"
            ><span>{{ t('Repair & civilian relief') }}</span
            ><b>60 CR</b></button
          >
        </template>
        <div class="eyebrow command-title">{{ t('FIELD ORDERS') }}</div>
        <p>{{
          t(
            'Dispatch from {sector}: {units} units. Select an allied sector to change the origin, then a neighbouring destination.',
            { sector: source.name, units: Math.max(0, source.units - 1) },
          )
        }}</p>
        <button
          class="primary"
          :disabled="!canMove"
          @click="store.act('command', 'move')"
          >{{
            sector.owner === 'player'
              ? t('Reinforce sector · 6s')
              : t('Advance on sector · 6s')
          }}
          <span>→</span></button
        >
        <button
          class="tactical-launch"
          :disabled="!canMove || sector.owner === 'player' || sector.units > 36"
          @click="store.act('battle')"
          >{{ t('Command tactical assault') }} <span>↗</span></button
        >
        <p class="micro">{{
          t(
            'Deploy up to 24 troops. Build a base, harvest ore and command the battle. The campaign pauses until you return.',
          )
        }}</p>
        <button class="danger" :disabled="!canStrike" @click="strike">{{
          armed
            ? t('Confirm strategic strike · 250 CR')
            : t('Arm strategic strike · 250 CR')
        }}</button>
        <p v-if="armed" class="micro danger-copy">{{
          t(
            'Severely damages infrastructure and raises relief strain. Stability falls by 30. Click again to execute.',
          )
        }}</p>
        <p v-else class="micro">{{
          t(
            'Strategic cooldown: {seconds}s. Requires escalation 70 and a non-allied sector.',
            { seconds: player.cooldown },
          )
        }}</p>
        <p v-if="store.error" class="command-error" role="alert">{{
          errors[store.error] || t('Order rejected.')
        }}</p>
      </section>
      <section class="panel activity"
        ><div class="eyebrow">{{ t('OPERATIONS LOG') }}</div
        ><ol aria-live="polite" aria-relevant="additions"
          ><li
            v-for="(event, index) in game.events"
            :key="`${event.tick}-${index}`"
            ><time
              >{{ String(Math.floor(event.tick / 60)).padStart(2, '0') }}:{{
                String(event.tick % 60).padStart(2, '0')
              }}</time
            ><span>{{ eventText(event) }}</span></li
          ></ol
        ></section
      >
    </aside>
    <footer class="campaign-footer panel">
      <div class="sector-grid" :aria-label="t('Sector selection')"
        ><button
          v-for="item in game.sectors"
          :key="item.id"
          :class="[
            'sector-cell',
            item.owner,
            { selected: item.id === store.selected },
          ]"
          :aria-pressed="item.id === store.selected"
          @click="select(item.id)"
          ><span>{{ item.name }}</span
          ><b>{{ item.units }}</b></button
        ></div
      >
      <div class="footer-brief"
        ><span class="eyebrow">{{ t('TACTICAL OVERVIEW') }}</span
        ><p>{{
          t(
            'Mint: allied · Coral: hostile · Blue: neutral. Routes connect horizontally and vertically. Leave one unit behind.',
          )
        }}</p></div
      >
      <div class="orders"
        ><span class="eyebrow">{{ t('ACTIVE ORDERS') }}</span
        ><p v-if="!game.orders.length">{{ t('No formations in transit.') }}</p
        ><div v-for="order in game.orders.slice(0, 3)" :key="order.id"
          >{{ game.sectors[order.target].name }} ·
          {{ order.type === 'train' ? t('Training') : t('Transit') }}
          <b>{{ order.remaining }}s</b></div
        ></div
      >
    </footer>
  </main>
</template>
