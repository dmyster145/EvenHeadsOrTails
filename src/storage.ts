import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { kvGet, kvSet } from './kv'

export interface Tally {
  heads: number
  tails: number
}

export interface DiceStats {
  rolls: number
  last: number | null
}

const TALLY_KEY = 'tally'
const BG_KEY = 'bgPattern'
const TALLY_ENABLED_KEY = 'tallyEnabled'
const RESET_ON_STARTUP_KEY = 'resetOnStartup'
const DICE_MODE_KEY = 'diceMode'
const DICE_STATS_KEY = 'diceStats'

export async function loadTally(bridge: EvenAppBridge): Promise<Tally> {
  const raw = await kvGet(bridge, TALLY_KEY)
  if (!raw) return { heads: 0, tails: 0 }
  try {
    const parsed = JSON.parse(raw) as Partial<Tally>
    return {
      heads: Number(parsed.heads) || 0,
      tails: Number(parsed.tails) || 0,
    }
  } catch {
    return { heads: 0, tails: 0 }
  }
}

export function saveTally(bridge: EvenAppBridge, tally: Tally): void {
  kvSet(bridge, TALLY_KEY, JSON.stringify(tally))
}

export function formatHeads(tally: Tally): string {
  return `Heads: ${tally.heads}`
}

export function formatTails(tally: Tally): string {
  return `Tails: ${tally.tails}`
}

async function loadFlag(
  bridge: EvenAppBridge,
  key: string,
  defaultValue: boolean,
): Promise<boolean> {
  const raw = await kvGet(bridge, key)
  if (raw === 'on') return true
  if (raw === 'off') return false
  return defaultValue
}

// Synchronous read of localStorage (the authoritative store) for priming the UI
// before the async startup resolves — avoids toggles flashing their default.
function peekFlag(key: string, defaultValue: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === 'on') return true
    if (raw === 'off') return false
  } catch {
    // localStorage unavailable.
  }
  return defaultValue
}

export const peekBgEnabled = (): boolean => peekFlag(BG_KEY, true)
export const peekTallyEnabled = (): boolean => peekFlag(TALLY_ENABLED_KEY, false)
export const peekResetOnStartup = (): boolean =>
  peekFlag(RESET_ON_STARTUP_KEY, false)

function saveFlag(bridge: EvenAppBridge, key: string, enabled: boolean): void {
  kvSet(bridge, key, enabled ? 'on' : 'off')
}

export const loadBgEnabled = (bridge: EvenAppBridge): Promise<boolean> =>
  loadFlag(bridge, BG_KEY, true)

export const saveBgEnabled = (bridge: EvenAppBridge, enabled: boolean): void =>
  saveFlag(bridge, BG_KEY, enabled)

export const loadTallyEnabled = (bridge: EvenAppBridge): Promise<boolean> =>
  loadFlag(bridge, TALLY_ENABLED_KEY, false)

export const saveTallyEnabled = (
  bridge: EvenAppBridge,
  enabled: boolean,
): void => saveFlag(bridge, TALLY_ENABLED_KEY, enabled)

export const loadResetOnStartup = (bridge: EvenAppBridge): Promise<boolean> =>
  loadFlag(bridge, RESET_ON_STARTUP_KEY, false)

export const saveResetOnStartup = (
  bridge: EvenAppBridge,
  enabled: boolean,
): void => saveFlag(bridge, RESET_ON_STARTUP_KEY, enabled)

export const peekDiceMode = (): boolean => peekFlag(DICE_MODE_KEY, false)

export const loadDiceMode = (bridge: EvenAppBridge): Promise<boolean> =>
  loadFlag(bridge, DICE_MODE_KEY, false)

export const saveDiceMode = (bridge: EvenAppBridge, enabled: boolean): void =>
  saveFlag(bridge, DICE_MODE_KEY, enabled)

export async function loadDiceStats(
  bridge: EvenAppBridge,
): Promise<DiceStats> {
  const raw = await kvGet(bridge, DICE_STATS_KEY)
  if (!raw) return { rolls: 0, last: null }
  try {
    const parsed = JSON.parse(raw) as Partial<DiceStats>
    return {
      rolls: Number(parsed.rolls) || 0,
      last: typeof parsed.last === 'number' ? parsed.last : null,
    }
  } catch {
    return { rolls: 0, last: null }
  }
}

export function saveDiceStats(bridge: EvenAppBridge, stats: DiceStats): void {
  kvSet(bridge, DICE_STATS_KEY, JSON.stringify(stats))
}

export function formatRolls(stats: DiceStats): string {
  return `Rolls: ${stats.rolls}`
}

export function formatLast(stats: DiceStats): string {
  return `Last rolled: ${stats.last ?? '-'}`
}
