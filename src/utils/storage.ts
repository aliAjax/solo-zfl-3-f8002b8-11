import type { Bench } from '@/types';
import type { AccessSnapshot, NetworkNode, Trail } from '@/types/accessibility';

const STORAGE_KEY = 'bench-archive-data';
const NETWORK_KEY = 'bench-archive-network';
const CLOSURES_KEY = 'bench-archive-closures';
const SNAPSHOT_KEY = 'bench-archive-access-snapshot';

export function loadBenches(): Bench[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load benches from localStorage:', error);
  }
  return [];
}

export function saveBenches(benches: Bench[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(benches));
  } catch (error) {
    console.error('Failed to save benches to localStorage:', error);
  }
}

export function clearBenches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear benches from localStorage:', error);
  }
}

export interface PersistedNetwork {
  nodes: NetworkNode[];
  trails: Trail[];
}

export function loadNetwork(): PersistedNetwork | null {
  try {
    const data = localStorage.getItem(NETWORK_KEY);
    if (data) {
      const parsed = JSON.parse(data) as PersistedNetwork;
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.trails)) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Failed to load network from localStorage:', error);
  }
  return null;
}

export function saveNetwork(network: PersistedNetwork): void {
  try {
    localStorage.setItem(NETWORK_KEY, JSON.stringify(network));
  } catch (error) {
    console.error('Failed to save network to localStorage:', error);
  }
}

export function loadClosures(): string[] {
  try {
    const data = localStorage.getItem(CLOSURES_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    }
  } catch (error) {
    console.error('Failed to load closures from localStorage:', error);
  }
  return [];
}

export function saveClosures(closedTrailIds: string[]): void {
  try {
    localStorage.setItem(CLOSURES_KEY, JSON.stringify(closedTrailIds));
  } catch (error) {
    console.error('Failed to save closures to localStorage:', error);
  }
}

/** 评估结果随档案持久化，刷新后仍在 */
export function loadSnapshot(): AccessSnapshot | null {
  try {
    const data = localStorage.getItem(SNAPSHOT_KEY);
    if (data) {
      const parsed = JSON.parse(data) as AccessSnapshot;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.results?.wheelchair)) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Failed to load access snapshot from localStorage:', error);
  }
  return null;
}

export function saveSnapshot(snapshot: AccessSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.error('Failed to save access snapshot to localStorage:', error);
  }
}
