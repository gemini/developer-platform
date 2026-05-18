import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AlertRule, AlertsFile } from './types.js';
import { DEFAULT_COOLDOWN_MS } from './types.js';

export const DEFAULT_ALERTS_DIR = join(homedir(), '.gemini-mcp');
export const DEFAULT_ALERTS_FILE = join(DEFAULT_ALERTS_DIR, 'alerts.json');

const EMPTY_FILE: AlertsFile = { version: 1, rules: [] };

export type CreateRuleInput = Omit<AlertRule, 'id' | 'createdAt' | 'lastFiredAt'> &
  Partial<Pick<AlertRule, 'id' | 'createdAt' | 'lastFiredAt'>>;

export type UpdateRulePatch = Partial<
  Pick<AlertRule, 'name' | 'enabled' | 'oneShot' | 'cooldownMs' | 'params' | 'lastFiredAt'>
>;

export interface AlertStoreOptions {
  filePath?: string;
}

export class AlertStore {
  readonly filePath: string;
  private readonly dir: string;

  constructor(opts: AlertStoreOptions = {}) {
    this.filePath = opts.filePath ?? DEFAULT_ALERTS_FILE;
    this.dir = dirname(this.filePath);
  }

  async list(): Promise<AlertRule[]> {
    const file = await this.read();
    return file.rules;
  }

  async get(id: string): Promise<AlertRule | undefined> {
    const file = await this.read();
    return file.rules.find((r) => r.id === id);
  }

  async create(input: CreateRuleInput): Promise<AlertRule> {
    const rule: AlertRule = {
      id: input.id ?? randomUUID(),
      name: input.name,
      category: input.category,
      enabled: input.enabled,
      oneShot: input.oneShot,
      cooldownMs: input.cooldownMs ?? DEFAULT_COOLDOWN_MS,
      params: input.params,
      createdAt: input.createdAt ?? new Date().toISOString(),
      lastFiredAt: input.lastFiredAt ?? null,
    };
    const file = await this.read();
    if (file.rules.some((r) => r.id === rule.id)) {
      throw new Error(`Alert rule already exists: ${rule.id}`);
    }
    file.rules.push(rule);
    await this.write(file);
    return rule;
  }

  async update(id: string, patch: UpdateRulePatch): Promise<AlertRule> {
    const file = await this.read();
    const idx = file.rules.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Alert rule not found: ${id}`);
    file.rules[idx] = { ...file.rules[idx], ...patch };
    await this.write(file);
    return file.rules[idx];
  }

  async delete(id: string): Promise<boolean> {
    const file = await this.read();
    const before = file.rules.length;
    file.rules = file.rules.filter((r) => r.id !== id);
    if (file.rules.length === before) return false;
    await this.write(file);
    return true;
  }

  async markFired(id: string, firedAt: string = new Date().toISOString()): Promise<AlertRule> {
    return this.update(id, { lastFiredAt: firedAt });
  }

  async read(): Promise<AlertsFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as AlertsFile;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rules)) {
        throw new Error('Malformed alerts file');
      }
      return parsed;
    } catch (err) {
      if (isENOENT(err)) return structuredClone(EMPTY_FILE);
      throw err;
    }
  }

  async write(file: AlertsFile): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const data = `${JSON.stringify(file, null, 2)}\n`;
    const handle = await fs.open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, this.filePath);
  }
}

function isENOENT(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
