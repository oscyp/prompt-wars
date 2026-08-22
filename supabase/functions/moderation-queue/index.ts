// Moderation Queue Edge Function (service-role only)
//
// The operator surface for the §22 24-hour report review SLA. Before this,
// report-intake wrote `reports` rows with a due_at and nothing ever read them.
//
// Actions:
//   { action: 'list' }                      -> pending reports, oldest due first
//   { action: 'stats' }                     -> pending / overdue counts
//   { action: 'resolve', report_id, decision, apply_block?, reviewer_id? }
//
// Not client-callable: the queue exposes both parties' identities and the
// reported content. Invoke with the service key (Supabase Studio, an internal
// tool, or curl).

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  hasSupabaseSecretAuthorization,
} from '../_shared/utils.ts';

interface QueueRequest {
  action?: 'list' | 'stats' | 'resolve';
  limit?: number;
  report_id?: string;
  decision?: 'actioned' | 'dismissed' | 'reviewed';
  apply_block?: boolean;
  reviewer_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (
    !hasSupabaseSecretAuthorization(
      req.headers.get('Authorization'),
      req.headers.get('apikey'),
    )
  ) {
    return errorResponse('Service role required', 403);
  }

  try {
    let body: QueueRequest = {};
    try {
      body = await req.json();
    } catch {
      // Default to `list` so a bare POST is useful.
    }

    const supabase = createServiceClient();
    const action = body.action ?? 'list';

    if (action === 'stats') {
      const { data: overdue, error: overdueError } = await supabase.rpc(
        'overdue_report_count',
      );
      if (overdueError) {
        console.error('overdue_report_count failed:', overdueError);
        return errorResponse('Failed to read queue stats', 500);
      }

      const { count, error: countError } = await supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (countError) {
        console.error('pending count failed:', countError);
        return errorResponse('Failed to read queue stats', 500);
      }

      return successResponse({ pending: count ?? 0, overdue: overdue ?? 0 });
    }

    if (action === 'resolve') {
      if (!body.report_id || !body.decision) {
        return errorResponse('report_id and decision required', 400);
      }

      const { data, error } = await supabase.rpc('resolve_report', {
        p_report_id: body.report_id,
        p_decision: body.decision,
        p_reviewer_id: body.reviewer_id ?? null,
        p_apply_block: body.apply_block ?? false,
      });

      if (error) {
        console.error('resolve_report failed:', error);
        return errorResponse(error.message || 'Failed to resolve report', 400);
      }

      return successResponse(data ?? {});
    }

    const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);
    const { data, error } = await supabase
      .from('moderation_queue')
      .select('*')
      .limit(limit);

    if (error) {
      console.error('Queue read failed:', error);
      return errorResponse('Failed to read moderation queue', 500);
    }

    return successResponse({
      reports: data ?? [],
      returned: data?.length ?? 0,
      overdue: (data ?? []).filter(
        (r: { is_overdue?: boolean }) => r.is_overdue,
      ).length,
    });
  } catch (error) {
    console.error('Moderation queue error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
