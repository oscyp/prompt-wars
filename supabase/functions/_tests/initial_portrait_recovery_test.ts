import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { renderOnePortrait } from '../_shared/render-portrait.ts';

for (const staged of [true, false])
  Deno.test(
    staged
      ? 'staged initial portraits never demote or publish current art before fenced commit'
      : 'ordinary paid render publication remains unchanged',
    async () => {
      const old = Deno.env.get('IMAGE_PROVIDER_MODE');
      Deno.env.set('IMAGE_PROVIDER_MODE', 'fallback');
      const writes: {
        table: string;
        action: string;
        value: Record<string, unknown>;
      }[] = [];
      const db = {
        from(table: string) {
          const q = {
            insert(value: Record<string, unknown>) {
              writes.push({ table, action: 'insert', value });
              return q;
            },
            update(value: Record<string, unknown>) {
              writes.push({ table, action: 'update', value });
              return q;
            },
            eq() {
              return q;
            },
            select() {
              return q;
            },
            single: () =>
              Promise.resolve({ data: { id: 'portrait-or-job' }, error: null }),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ error: null }).then(resolve),
          };
          return q;
        },
        storage: {
          from: () => ({ upload: () => Promise.resolve({ error: null }) }),
        },
      };
      try {
        const input = {
          supabase: db,
          userId: 'owner',
          character: {
            id: 'fighter',
            archetype: 'strategist',
            signature_color: '#6366F1',
          },
          kind: 'fighter' as const,
          promptRaw: '',
          artStyle: 'painterly' as const,
          traits: {},
          seed: 42,
          jobKind: 'generate' as const,
          ...(staged ? { deferPublication: true } : {}),
        };
        assertEquals((await renderOnePortrait(input)).ok, true);
        assertEquals(
          writes.filter(
            (w) => w.table === 'character_portraits' && w.action === 'update',
          ).length,
          staged ? 0 : 1,
        );
        assertEquals(
          writes.find(
            (w) => w.table === 'character_portraits' && w.action === 'insert',
          )?.value.is_current,
          !staged,
        );
      } finally {
        if (old === undefined) Deno.env.delete('IMAGE_PROVIDER_MODE');
        else Deno.env.set('IMAGE_PROVIDER_MODE', old);
      }
    },
  );
