<script setup>
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { t } from '../i18n/index.js';
import { useConquestStore } from '../ui/stores/conquest.js';
import {
  FIELD,
  BUILDINGS,
  TROOPS,
  fieldPower,
  fieldPlacement,
  fieldSurvivors,
} from './battlefield.js';
const store = useConquestStore();
const field = computed(() => store.battlefield);
const svg = ref(null);
const retreatArmed = ref(false);
const dragStart = ref(null);
const selectionBox = ref(null);
let suppressClick = false;
function dragDown(event) {
  if (
    event.button !== 0 ||
    store.buildTool ||
    event.target.closest('.field-unit, .field-building, .ore-patch')
  )
    return;
  dragStart.value = {
    ...point(event),
    screenX: event.clientX,
    screenY: event.clientY,
  };
  svg.value.setPointerCapture?.(event.pointerId);
}
function dragMove(event) {
  store.hoverCell = point(event);
  if (
    !dragStart.value ||
    Math.hypot(
      event.clientX - dragStart.value.screenX,
      event.clientY - dragStart.value.screenY,
    ) < 6
  )
    return;
  const start = dragStart.value,
    end = store.hoverCell;
  selectionBox.value = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  };
}
function dragUp(event) {
  if (selectionBox.value) {
    store.act('tacticalBox', selectionBox.value, event.shiftKey);
    suppressClick = true;
  }
  dragStart.value = null;
  selectionBox.value = null;
}

const power = computed(() => fieldPower(field.value, 'player'));
const selected = computed(() =>
  field.value.units.filter((u) => store.selectedUnits.includes(u.id)),
);
const building = computed(() =>
  field.value.buildings.find(
    (b) => b.id === store.selectedBuilding && b.owner === 'player',
  ),
);
const active = computed(
  () => !store.tacticalPaused && field.value.status === 'playing',
);
const names = computed(() => ({
  hq: t('Command centre'),
  power: t('Power plant'),
  refinery: t('Ore refinery'),
  barracks: t('Barracks'),
  factory: t('War factory'),
  turret: t('Defence turret'),
  infantry: t('Infantry'),
  tank: t('Tank'),
  harvester: t('Harvester'),
}));
const errors = computed(() => ({
  funds: t('Insufficient credits.'),
  occupied: t('Choose clear ground away from units, buildings and ore.'),
  'build-range': t('Place within seven cells of an allied base building.'),
  'invalid-placement': t('That building does not fit here.'),
  blocked: t('That placement would trap a unit.'),
  selection: t('Select allied units first.'),
  target: t('Select combat units, then an enemy target.'),
  harvester: t('Select harvesters, then an ore field.'),
  'invalid-move': t('Choose clear ground for movement.'),
  unreachable: t('No route reaches that destination.'),
  producer: t('Select the required production building.'),
  queue: t('This production queue is occupied.'),
  'unit-limit': t('Unit limit reached: 64 per faction.'),
  paused: t('Resume the battlefield before issuing orders.'),
  finished: t('The battle has ended.'),
}));
const ghost = computed(() =>
  store.buildTool && store.hoverCell
    ? {
        ...store.hoverCell,
        size: BUILDINGS[store.buildTool].size,
        valid: !fieldPlacement(
          field.value,
          'player',
          store.buildTool,
          store.hoverCell.x,
          store.hoverCell.y,
        ),
      }
    : null,
);
function point(event) {
  const bounds = svg.value.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(
        FIELD.width - 1,
        Math.floor(
          ((event.clientX - bounds.left) / bounds.width) * FIELD.width,
        ),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        FIELD.height - 1,
        Math.floor(
          ((event.clientY - bounds.top) / bounds.height) * FIELD.height,
        ),
      ),
    ),
  };
}
function click(event) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const p = point(event);
  store.act('tacticalClick', p.x, p.y);
}
function context(event) {
  const p = point(event);
  store.act('tacticalClick', p.x, p.y);
}
function tool(kind) {
  store.buildTool = store.buildTool === kind ? null : kind;
  store.tacticalError = '';
  store.hoverCell ??= { x: 10, y: 12 };
}
function gather(patch) {
  store.act('tacticalCommand', {
    type: 'gather',
    units: store.selectedUnits,
    patch: patch.id,
  });
}
function train(kind) {
  store.act('tacticalCommand', {
    type: 'train',
    kind,
    building: building.value.id,
  });
}
function keyboard(event) {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const p = store.hoverCell ?? { x: 15, y: 10 };
    store.hoverCell = {
      x: Math.max(
        0,
        Math.min(
          31,
          p.x +
            (event.key === 'ArrowLeft'
              ? -1
              : event.key === 'ArrowRight'
                ? 1
                : 0),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          21,
          p.y +
            (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0),
        ),
      ),
    };
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const p = store.hoverCell ?? { x: 15, y: 10 };
    store.act('tacticalClick', p.x, p.y);
  } else if (event.key === 'Escape') {
    store.buildTool = null;
    store.selectedUnits = [];
    store.selectedBuilding = null;
  }
}
function leave() {
  if (retreatArmed.value) store.act('leaveBattle', true);
  else retreatArmed.value = true;
}
let previousFocus;
onMounted(() => {
  previousFocus = document.activeElement;
  svg.value?.focus();
});
onBeforeUnmount(() => {
  nextTick(() => previousFocus?.focus?.());
});
</script>

<template>
  <section class="tactical-root" :aria-label="t('Tactical battlefield')">
    <header class="tactical-header">
      <div class="tactical-brand"
        ><span>◉</span
        ><div
          >{{ t('GOD’S EYE') }}<small>{{ t('GROUND COMMAND') }}</small></div
        ></div
      >
      <div class="tactical-location"
        ><span class="eyebrow">{{ t('SECTOR ASSAULT') }}</span
        ><strong>{{ field.sector }}</strong></div
      >
      <div class="tactical-clock"
        >{{
          Math.floor((field.tick * FIELD.step) / 60)
            .toString()
            .padStart(2, '0')
        }}:{{
          Math.floor((field.tick * FIELD.step) % 60)
            .toString()
            .padStart(2, '0')
        }}<button
          :disabled="field.status !== 'playing'"
          @click="store.tacticalPaused = !store.tacticalPaused"
          >{{ store.tacticalPaused ? t('Resume') : t('Pause') }}</button
        ></div
      >
    </header>
    <aside class="tactical-build panel">
      <div class="eyebrow">{{ t('BASE CONSTRUCTION') }}</div>
      <h2>{{ t('Establish control.') }}</h2>
      <p>{{
        t(
          'Place buildings near your base. Harvest ore to fund the assault. Destroy the enemy command centre to capture the sector.',
        )
      }}</p>
      <button
        v-for="kind in ['power', 'refinery', 'barracks', 'factory', 'turret']"
        :key="kind"
        :class="{ armed: store.buildTool === kind }"
        :disabled="!active || field.credits.player < BUILDINGS[kind].cost"
        @click="tool(kind)"
        ><span
          >{{ names[kind]
          }}<small
            >{{ BUILDINGS[kind].size }} × {{ BUILDINGS[kind].size }}</small
          ></span
        ><b>{{ BUILDINGS[kind].cost }} CR</b></button
      >
      <p class="tactical-tool-note">{{
        store.buildTool
          ? t('Click a green placement preview to construct. Escape cancels.')
          : t(
              'Choose a building, then click clear ground. Buildings extend your construction area.',
            )
      }}</p>
      <div class="tactical-road-key"
        ><i></i>{{ t('Roads: faster routes') }}<br /><em></em
        >{{ t('Rough ground: slower routes') }}</div
      >
      <p class="micro">{{
        t(
          'Authored terrain and roads. Real road-network imports are not connected yet.',
        )
      }}</p>
      <button
        class="quiet retreat"
        :disabled="field.status !== 'playing'"
        @click="leave"
        >{{
          retreatArmed ? t('Confirm retreat') : t('Retreat to campaign')
        }}</button
      >
      <p v-if="retreatArmed" class="micro">{{
        t(
          'Surviving troops return to the source sector. The enemy keeps this sector.',
        )
      }}</p>
    </aside>
    <div class="tactical-centre">
      <div class="tactical-economy panel"
        ><div
          ><span>{{ t('CREDITS') }}</span
          ><strong>{{ field.credits.player }} <small>CR</small></strong></div
        ><div :class="{ 'power-warning': power.demand > power.supply }"
          ><span>{{ t('POWER') }}</span
          ><strong
            >{{ power.supply }}<small> / {{ power.demand }}</small></strong
          ></div
        ><div
          ><span>{{ t('COMBAT UNITS') }}</span
          ><strong
            >{{ fieldSurvivors(field, 'player')
            }}<small> / {{ fieldSurvivors(field, 'enemy') }}</small></strong
          ></div
        ></div
      >
      <div class="tactical-mapbox">
        <svg
          ref="svg"
          class="tactical-map"
          viewBox="0 0 1024 704"
          role="group"
          tabindex="0"
          :aria-label="
            t(
              'Battlefield: arrows position the cursor; Enter issues an order; Escape clears selection.',
            )
          "
          @click="click"
          @contextmenu.prevent="context"
          @pointerdown="dragDown"
          @pointermove="dragMove"
          @pointerup="dragUp"
          @pointercancel="
            dragStart = null;
            selectionBox = null;
          "
          @keydown="keyboard"
        >
          <defs>
            <pattern
              id="field-grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <rect width="32" height="32" fill="#162c2d" />
              <path
                d="M32 0H0V32"
                fill="none"
                stroke="#254040"
                stroke-width=".6"
              />
              <path
                d="M7 9h2m13 13h1m-8 7h2"
                stroke="#29413a"
                stroke-width="1"
              />
            </pattern>
            <pattern
              id="rough-grid"
              width="9"
              height="9"
              patternUnits="userSpaceOnUse"
            >
              <path d="M1 8L7 2" stroke="#6b6954" stroke-width="2" />
            </pattern>
          </defs>
          <rect width="1024" height="704" fill="url(#field-grid)" />
          <rect
            v-for="(p, i) in field.rough"
            :key="`rough${i}`"
            :x="p.x * 32"
            :y="p.y * 32"
            width="32"
            height="32"
            fill="url(#rough-grid)"
            opacity=".5"
          />
          <g class="tactical-roads">
            <rect
              v-for="(p, i) in field.roads"
              :key="`road${i}`"
              :x="p.x * 32"
              :y="p.y * 32"
              width="32"
              height="32"
            />
            <path d="M0 336H1024M496 0V704" />
          </g>
          <g
            v-for="(p, i) in field.rocks"
            :key="`rock${i}`"
            :transform="`translate(${p.x * 32},${p.y * 32})`"
          >
            <path
              d="M3 23L7 6L21 2L30 14L25 29L11 30Z"
              fill="#59655b"
              stroke="#7a8678"
            />
            <path
              d="M7 6L16 15L30 14M16 15L11 30"
              stroke="#36443f"
              fill="none"
            />
          </g>
          <g
            v-for="patch in field.resources.filter((p) => p.amount > 0)"
            :key="patch.id"
            :transform="`translate(${patch.x * 32},${patch.y * 32})`"
            class="ore-patch"
            role="button"
            tabindex="0"
            :aria-label="
              t('Harvest ore: {amount} remaining', { amount: patch.amount })
            "
            @click.stop="gather(patch)"
            @contextmenu.stop.prevent="gather(patch)"
            @keydown.enter.stop.prevent="gather(patch)"
          >
            <rect width="32" height="32" fill="#665b2e" opacity=".5" />
            <path
              d="M5 24L10 7L17 4L20 18L26 10L29 26L18 30Z"
              fill="#d6b94b"
              stroke="#f4de7a"
            />
            <title>{{ t('Ore · {amount}', { amount: patch.amount }) }}</title>
          </g>
          <g
            v-for="b in field.buildings"
            :key="b.id"
            :transform="`translate(${b.x * 32},${b.y * 32})`"
            :class="[
              'field-building',
              b.owner,
              { selected: b.id === store.selectedBuilding },
            ]"
            role="button"
            tabindex="0"
            :aria-label="
              t('{owner} {building}: {hp} health', {
                owner: b.owner === 'player' ? t('Allied') : t('Enemy'),
                building: names[b.kind],
                hp: b.hp,
              })
            "
            @click.stop="store.act('tacticalSelect', b.id)"
            @contextmenu.stop.prevent="store.act('tacticalSelect', b.id)"
            @keydown.enter.stop.prevent="store.act('tacticalSelect', b.id)"
          >
            <rect
              x="2"
              y="2"
              :width="BUILDINGS[b.kind].size * 32 - 4"
              :height="BUILDINGS[b.kind].size * 32 - 4"
              rx="3"
              class="building-outline"
            />
            <rect
              x="8"
              y="8"
              :width="BUILDINGS[b.kind].size * 32 - 16"
              :height="BUILDINGS[b.kind].size * 32 - 16"
              fill="#243e43"
            />
            <path
              v-if="b.kind === 'hq'"
              d="M18 62V28L48 13L78 28V62H61V43H35V62Z M17 72H79M26 79H70"
              class="building-icon"
            />
            <path
              v-else-if="b.kind === 'power'"
              d="M35 11L20 34H31L26 53L46 28H33Z"
              class="building-icon"
            />
            <g v-else-if="b.kind === 'refinery'" class="building-icon">
              <circle cx="23" cy="30" r="12" />
              <circle cx="43" cy="38" r="11" />
              <path d="M12 48H50M23 13V8M43 22V12" />
            </g>
            <path
              v-else-if="b.kind === 'barracks'"
              d="M12 20H51V47H12Z M17 26H27V34H17Z M35 26H45V34H35Z M28 39V47"
              class="building-icon"
            />
            <path
              v-else-if="b.kind === 'factory'"
              d="M13 70V34L34 22V36L55 22V36L78 24V70Z M20 60H69M63 22V11H73V24"
              class="building-icon"
            />
            <g v-else class="building-icon">
              <circle cx="16" cy="16" r="8" />
              <path d="M16 16V1" stroke-width="4" />
            </g>
            <rect
              x="4"
              y="-7"
              :width="BUILDINGS[b.kind].size * 32 - 8"
              height="3"
              fill="#101e24"
            />
            <rect
              x="4"
              y="-7"
              :width="
                ((BUILDINGS[b.kind].size * 32 - 8) * b.hp) /
                BUILDINGS[b.kind].hp
              "
              height="3"
              fill="currentColor"
            />
          </g>
          <g
            v-for="unit in field.units"
            :key="unit.id"
            :transform="`translate(${(unit.x + 0.5) * 32},${(unit.y + 0.5) * 32})`"
            :class="[
              'field-unit',
              unit.owner,
              { selected: store.selectedUnits.includes(unit.id) },
            ]"
            role="button"
            tabindex="0"
            :aria-label="
              t('{owner} {unit}: {hp} health', {
                owner: unit.owner === 'player' ? t('Allied') : t('Enemy'),
                unit: names[unit.kind],
                hp: unit.hp,
              })
            "
            @click.stop="store.act('tacticalSelect', unit.id, $event.shiftKey)"
            @keydown.enter.stop.prevent="
              store.act('tacticalSelect', unit.id, $event.shiftKey)
            "
          >
            <circle class="selection-ring" r="14" />
            <g v-if="unit.kind === 'tank'">
              <rect
                x="-12"
                y="-10"
                width="24"
                height="20"
                rx="3"
                fill="#111d23"
                stroke="currentColor"
              />
              <path d="M-8-7H8V7H-8Z" fill="currentColor" />
              <circle r="5" fill="#243e43" stroke="currentColor" />
              <path d="M0 0H17" stroke="currentColor" stroke-width="4" />
            </g>
            <g v-else-if="unit.kind === 'harvester'">
              <rect
                x="-13"
                y="-9"
                width="26"
                height="18"
                rx="3"
                fill="#243e43"
                stroke="currentColor"
                stroke-width="2"
              />
              <rect
                x="-9"
                y="-5"
                :width="Math.max(2, (unit.cargo / 50) * 18)"
                height="10"
                fill="#d6b94b"
              />
              <path
                d="M13-8L18-12M13 8L18 12"
                stroke="currentColor"
                stroke-width="2"
              />
            </g>
            <g v-else>
              <circle
                r="7"
                fill="currentColor"
                stroke="#112a31"
                stroke-width="2"
              />
              <path d="M3-2L12-6" stroke="currentColor" stroke-width="3" />
            </g>
            <rect x="-11" y="-18" width="22" height="3" fill="#11212b" />
            <rect
              x="-11"
              y="-18"
              :width="(22 * unit.hp) / TROOPS[unit.kind].hp"
              height="3"
              fill="currentColor"
            />
          </g>
          <path
            v-for="(shot, i) in field.shots"
            :key="`shot${i}`"
            :d="`M${(shot.from.x + 0.5) * 32} ${(shot.from.y + 0.5) * 32}L${(shot.to.x + 0.5) * 32} ${(shot.to.y + 0.5) * 32}`"
            :stroke="shot.owner === 'player' ? '#c6fff2' : '#ffb7a0'"
            stroke-width="2"
            opacity=".8"
            pointer-events="none"
          />
          <rect
            v-if="selectionBox"
            :x="selectionBox.x * 32"
            :y="selectionBox.y * 32"
            :width="(selectionBox.width + 1) * 32"
            :height="(selectionBox.height + 1) * 32"
            fill="#9dffcf16"
            stroke="#b2f7dc"
            stroke-width="1.5"
            pointer-events="none"
          />
          <rect
            v-if="ghost"
            :x="ghost.x * 32"
            :y="ghost.y * 32"
            :width="ghost.size * 32"
            :height="ghost.size * 32"
            :fill="ghost.valid ? '#76efb736' : '#f56e6336'"
            :stroke="ghost.valid ? '#76efb7' : '#f56e63'"
            stroke-width="2"
            pointer-events="none"
          />
          <rect
            v-else-if="store.hoverCell"
            :x="store.hoverCell.x * 32"
            :y="store.hoverCell.y * 32"
            width="32"
            height="32"
            fill="none"
            stroke="#b4d5cf"
            opacity=".5"
            pointer-events="none"
          />
        </svg>
        <div
          v-if="store.tacticalPaused && field.status === 'playing'"
          class="tactical-paused"
          >{{ t('BATTLE PAUSED') }}</div
        >
        <div
          v-if="field.status === 'finished'"
          class="tactical-outcome panel"
          role="status"
          ><div class="eyebrow">{{ t('BATTLE COMPLETE') }}</div
          ><h2>{{
            field.winner === 'player'
              ? t('Enemy command destroyed.')
              : field.winner === 'draw'
                ? t('Both commands destroyed.')
                : t('Command centre lost.')
          }}</h2
          ><p>{{
            t('{count} combat units survived.', {
              count: fieldSurvivors(field, 'player'),
            })
          }}</p
          ><button class="primary" @click="store.act('leaveBattle', false)"
            >{{ t('Apply outcome & return to campaign') }} →</button
          ></div
        >
      </div>
      <div class="tactical-map-caption"
        ><span>{{ t('FICTIONAL BATTLEFIELD · 32 × 22') }}</span
        ><span>{{ t('MINT / ALLIED · CORAL / ENEMY · GOLD / ORE') }}</span></div
      >
      <p class="tactical-status" role="status">{{
        store.tacticalError
          ? errors[store.tacticalError] || t('Order rejected.')
          : store.buildTool
            ? t('Construction mode: {building}', {
                building: names[store.buildTool],
              })
            : selected.length
              ? t(
                  '{count} units selected. Click ground to order; click an enemy to attack.',
                  { count: selected.length },
                )
              : t(
                  'Select units or a building. Drag a box to select a group; Shift adds to selection.',
                )
      }}</p>
    </div>
    <aside class="tactical-orders panel">
      <div class="eyebrow">{{ t('FIELD COMMAND') }}</div>
      <h2>{{ building ? names[building.kind] : t('Your formation') }}</h2>
      <div class="tactical-select-actions"
        ><button @click="store.act('tacticalAll', 'combat')">{{
          t('Select army')
        }}</button
        ><button @click="store.act('tacticalAll', 'harvester')">{{
          t('Select harvesters')
        }}</button></div
      >
      <template v-if="building">
        <p>{{
          t('Health: {hp}/{maximum}', {
            hp: building.hp,
            maximum: BUILDINGS[building.kind].hp,
          })
        }}</p>
        <template v-for="kind in ['infantry', 'tank', 'harvester']" :key="kind"
          ><button
            v-if="TROOPS[kind].producer === building.kind"
            class="tactical-train"
            :disabled="
              !active ||
              !!building.queue ||
              field.credits.player < TROOPS[kind].cost
            "
            @click="train(kind)"
            ><span
              >{{ names[kind]
              }}<small>{{ TROOPS[kind].time * FIELD.step }}s</small></span
            ><b>{{ TROOPS[kind].cost }} CR</b></button
          ></template
        >
        <div v-if="building.queue" class="tactical-queue"
          ><span>{{
            t('Producing {unit}', { unit: names[building.queue.kind] })
          }}</span
          ><progress
            :max="TROOPS[building.queue.kind].time"
            :value="TROOPS[building.queue.kind].time - building.queue.remaining"
          ></progress
          ><small
            >{{ Math.ceil(building.queue.remaining * FIELD.step) }}s</small
          ></div
        >
        <p v-if="power.demand > power.supply" class="power-warning">{{
          t(
            'Low power: production and turrets are paused. Build a power plant.',
          )
        }}</p>
      </template>
      <template v-else>
        <p>{{ t('Movement order') }}</p>
        <button
          :class="{ armed: store.tacticalOrder === 'move' }"
          @click="store.tacticalOrder = 'move'"
          >{{ t('Move') }}</button
        ><button
          :class="{ armed: store.tacticalOrder === 'advance' }"
          @click="store.tacticalOrder = 'advance'"
          >{{ t('Attack-move') }}</button
        >
        <button
          :disabled="!active || !selected.length"
          @click="
            store.act('tacticalCommand', {
              type: 'stop',
              units: store.selectedUnits,
            })
          "
          >{{ t('Stop & defend') }}</button
        >
        <p class="micro">{{
          t(
            'Move follows a route without stopping to fight. Attack-move engages nearby enemies. Click an enemy for a focused attack.',
          )
        }}</p>
        <div class="tactical-unit-list"
          ><button
            v-for="unit in field.units.filter((u) => u.owner === 'player')"
            :key="unit.id"
            :class="{ armed: store.selectedUnits.includes(unit.id) }"
            @click="store.act('tacticalSelect', unit.id, $event.shiftKey)"
            ><span>{{ names[unit.kind] }} #{{ unit.id }}</span
            ><small>{{ unit.hp }}</small></button
          ></div
        >
      </template>
      <div class="tactical-help"
        ><div class="eyebrow">{{ t('QUICK START') }}</div
        ><ol
          ><li>{{ t('Build barracks and select them to train infantry.') }}</li
          ><li>{{ t('Keep harvesters moving between ore and refineries.') }}</li
          ><li>{{
            t('Build a factory for tanks, then advance on the enemy base.')
          }}</li></ol
        ><p class="micro">{{
          t(
            'For keyboard orders: focus the battlefield, move the cursor with arrows and press Enter. Escape cancels selection.',
          )
        }}</p></div
      >
    </aside>
  </section>
</template>
