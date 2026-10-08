export interface AvatarReference {
  kind: 'players' | 'battles';
  id: string;
}
export interface PlayerAvatar {
  identity?: {
    name: string;
    archetype: string;
    signature_color: string;
    cosmetic_config: Record<string, string> | null;
  };
  status: 'available' | 'unavailable' | 'retryable';
  asset_id?: string;
  signed_url?: string;
  expires_at?: string;
}
export interface AvatarBatch {
  profile_ids: string[];
  battle_ids: string[];
}
type Response = {
  players?: Record<string, PlayerAvatar>;
  battles?: Record<string, PlayerAvatar>;
};
type Transport = (account: string, body: AvatarBatch) => Promise<Response>;
const keyFor = (ref: AvatarReference) => `${ref.kind}:${ref.id}`;

/** Memory-only, account-scoped identities pointing to opaque approved assets.
 * A queue coalesces row/page requests and caps every signing call at 50 IDs. */
export class PlayerAvatarCache {
  private account: string | null = null;
  private epoch = 0;
  private entries = new Map<
    string,
    { value: PlayerAvatar; refreshAt: number }
  >();
  private pending = new Map<string, Promise<void>>();
  private queued = new Map<
    string,
    { ref: AvatarReference; done: () => void }
  >();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private transport: Transport) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  setAccount(account: string | null) {
    if (account === this.account) return;
    this.epoch++;
    this.account = account;
    this.entries.clear();
    this.pending.clear();
    this.queued.forEach((job) => job.done());
    this.queued.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.emit();
  }
  get(
    account: string | null | undefined,
    ref: AvatarReference,
  ): PlayerAvatar | undefined {
    return account && account === this.account
      ? this.entries.get(keyFor(ref))?.value
      : undefined;
  }
  request(
    account: string,
    refs: readonly AvatarReference[],
    force = false,
  ): Promise<void> {
    this.setAccount(account);
    const waits = refs.map((ref) => {
      const key = keyFor(ref),
        pending = this.pending.get(key);
      if (pending) return pending;
      if (!force && (this.entries.get(key)?.refreshAt ?? 0) > Date.now())
        return Promise.resolve();
      let done!: () => void;
      const promise = new Promise<void>((resolve) => {
        done = resolve;
      });
      this.pending.set(key, promise);
      this.queued.set(key, { ref, done });
      return promise;
    });
    if (this.queued.size && !this.timer)
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, 0);
    return Promise.all(waits).then(() => {});
  }
  private async flush() {
    const epoch = this.epoch,
      account = this.account!;
    const jobs = [...this.queued.entries()];
    this.queued.clear();
    for (let i = 0; i < jobs.length; i += 50) {
      const chunk = jobs.slice(i, i + 50);
      if (epoch !== this.epoch) {
        chunk.forEach(([, job]) => job.done());
        continue;
      }
      let response: Response = {};
      try {
        response = await this.transport(account, {
          profile_ids: chunk
            .filter(([, j]) => j.ref.kind === 'players')
            .map(([, j]) => j.ref.id),
          battle_ids: chunk
            .filter(([, j]) => j.ref.kind === 'battles')
            .map(([, j]) => j.ref.id),
        });
      } catch {
        /* Transient failures retain known artwork for the same identity. */
      }
      if (epoch === this.epoch) {
        for (const [key, job] of chunk) {
          const incoming = response[job.ref.kind]?.[job.ref.id];
          const valid =
            incoming?.status === 'available' &&
            incoming.asset_id &&
            incoming.signed_url &&
            Number.isFinite(Date.parse(incoming.expires_at ?? ''));
          const value: PlayerAvatar = valid
            ? incoming
            : incoming?.status === 'unavailable'
              ? { status: 'unavailable', identity: incoming.identity }
              : { ...this.entries.get(key)?.value, status: 'retryable' };
          this.entries.delete(key);
          this.entries.set(key, {
            value,
            refreshAt: valid
              ? Math.max(
                  Date.now() + 10_000,
                  Date.parse(incoming.expires_at!) - 5 * 60_000,
                )
              : Date.now() + 30_000,
          });
          this.pending.delete(key);
        }
        // Bound memory while preserving the most recently accessed page.
        while (this.entries.size > 500)
          this.entries.delete(this.entries.keys().next().value!);
        this.emit();
      }
      chunk.forEach(([, job]) => job.done());
    }
  }
}
