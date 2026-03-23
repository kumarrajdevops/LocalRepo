import { DrHaProfile, ExperimentPlan, ValidationRun } from './types';

const profiles = new Map<string, DrHaProfile>();
const runs = new Map<string, ValidationRun>();

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function createProfile(input: Omit<DrHaProfile, 'id' | 'createdAt' | 'updatedAt'>): DrHaProfile {
  const id = genId('profile');
  const now = Date.now();
  const prof: DrHaProfile = { id, createdAt: now, updatedAt: now, ...input };
  profiles.set(id, prof);
  return prof;
}

export function updateProfile(id: string, patch: Partial<Omit<DrHaProfile, 'id' | 'createdAt'>>): DrHaProfile | undefined {
  const existing = profiles.get(id);
  if (!existing) return undefined;
  const updated: DrHaProfile = {
    ...existing,
    ...patch,
    updatedAt: Date.now()
  };
  profiles.set(id, updated);
  return updated;
}

export function getProfile(id: string): DrHaProfile | undefined {
  return profiles.get(id);
}

export function listProfiles(): DrHaProfile[] {
  return Array.from(profiles.values());
}

export function createValidationRun(profileId: string, experiments: ExperimentPlan[]): ValidationRun | undefined {
  if (!profiles.has(profileId)) return undefined;
  const id = genId('run');
  const now = Date.now();
  const run: ValidationRun = {
    id,
    profileId,
    createdAt: now,
    status: 'pending',
    experiments
  };
  runs.set(id, run);
  return run;
}

export function updateValidationRun(id: string, patch: Partial<ValidationRun>): ValidationRun | undefined {
  const existing = runs.get(id);
  if (!existing) return undefined;
  const updated: ValidationRun = { ...existing, ...patch };
  runs.set(id, updated);
  return updated;
}

export function getValidationRun(id: string): ValidationRun | undefined {
  return runs.get(id);
}

export function listValidationRuns(profileId?: string): ValidationRun[] {
  const all = Array.from(runs.values());
  if (!profileId) return all;
  return all.filter((r) => r.profileId === profileId);
}

