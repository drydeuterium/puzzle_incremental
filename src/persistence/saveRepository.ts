import { BACKUP_SAVE_KEY, CORRUPT_SAVE_PREFIX, SAVE_KEY, createInitialSave, validateSaveData } from "./schema";
import type { SaveDataV1 } from "../core/types";

export type LoadSaveResult = Readonly<{
  save: SaveDataV1;
  recovered: boolean;
  message: string | null;
}>;

function parseSave(raw: string | null): SaveDataV1 | null {
  if (!raw) {
    return null;
  }
  try {
    return validateSaveData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadSave(storage: Storage = localStorage): LoadSaveResult {
  const primaryRaw = storage.getItem(SAVE_KEY);
  const primary = parseSave(primaryRaw);
  if (primary) {
    return { save: primary, recovered: false, message: null };
  }
  const backup = parseSave(storage.getItem(BACKUP_SAVE_KEY));
  if (backup) {
    return { save: backup, recovered: true, message: "Recovered save from backup." };
  }
  if (primaryRaw) {
    storage.setItem(`${CORRUPT_SAVE_PREFIX}${Date.now()}`, primaryRaw);
  }
  const save = createInitialSave();
  saveGame(save, storage);
  return { save, recovered: Boolean(primaryRaw), message: primaryRaw ? "Corrupt save was moved aside." : null };
}

export function saveGame(save: SaveDataV1, storage: Storage = localStorage): void {
  const updated: SaveDataV1 = { ...save, updatedAt: new Date().toISOString(), statistics: { ...save.statistics, lastSavedAt: new Date().toISOString() } };
  const raw = JSON.stringify(updated);
  storage.setItem(BACKUP_SAVE_KEY, raw);
  const parsed = JSON.parse(storage.getItem(BACKUP_SAVE_KEY) ?? "");
  if (!validateSaveData(parsed)) {
    throw new Error("Backup save validation failed");
  }
  storage.setItem(SAVE_KEY, raw);
}

export function exportSave(save: SaveDataV1): string {
  return JSON.stringify(save, null, 2);
}

export function importSave(raw: string): SaveDataV1 | null {
  try {
    return validateSaveData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function eraseSave(storage: Storage = localStorage): void {
  storage.removeItem(SAVE_KEY);
  storage.removeItem(BACKUP_SAVE_KEY);
}
