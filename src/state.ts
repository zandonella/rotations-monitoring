import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

export type CheckStatus = 'ok' | 'warn' | 'error';

export type CheckResult = {
    status: CheckStatus;
    detail: string;
};

export type CheckRecord = {
    status: CheckStatus;
    detail: string;
    since: string;
    lastChecked: string;
    lastOk: string | null;
};

type StoredState = Record<string, CheckRecord>;

function loadState(): StoredState {
    try {
        const raw = fs.readFileSync(config.stateFile, 'utf8');
        return JSON.parse(raw) as StoredState;
    } catch {
        return {};
    }
}

const state: StoredState = loadState();

function persist() {
    try {
        fs.mkdirSync(path.dirname(config.stateFile), { recursive: true });
        fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
        console.warn('Failed to persist state file:', error);
    }
}

export function getState(): StoredState {
    return state;
}

export function updateCheck(
    name: string,
    result: CheckResult,
): { changed: boolean; previous: CheckStatus } {
    const now = new Date().toISOString();
    const previous = state[name]?.status ?? 'ok';
    const changed = result.status !== previous;

    state[name] = {
        status: result.status,
        detail: result.detail,
        since: changed ? now : (state[name]?.since ?? now),
        lastChecked: now,
        lastOk:
            result.status === 'ok' ? now : (state[name]?.lastOk ?? null),
    };

    persist();
    return { changed, previous };
}
