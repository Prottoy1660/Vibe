/** Shared types + flatten helper for email team detail (pool mailboxes + user seats). */

export interface TeamDetailUserEmail {
  id: string;
  assigned_at: string;
  is_active: boolean;
  order_id: string | null;
  users: { id: string; name: string; email: string } | null;
  orders: { status: string } | null;
}

export interface TeamDetailPoolRow {
  id: string;
  email: string;
  password: string;
  status: string;
  assigned_at: string | null;
  created_at: string;
  slot_intent: string | null;
  current_users?: number | null;
  is_burned?: boolean | null;
  products: { title: string } | null;
  user_emails: TeamDetailUserEmail[] | null;
}

export interface FlatTeamAssignmentRow {
  poolId: string;
  poolEmail: string;
  password: string;
  poolStatus: string;
  productTitle: string;
  slotIntent: string;
  poolCreatedAt: string;
  poolAssignedAt: string;
  userName: string;
  userEmail: string;
  assignmentAt: string;
  assignmentActive: boolean;
  orderStatus: string;
  userEmailRowId: string;
}

export function flattenTeamAssignments(rows: TeamDetailPoolRow[]): FlatTeamAssignmentRow[] {
  const out: FlatTeamAssignmentRow[] = [];
  for (const r of rows) {
    const ues = r.user_emails?.length ? r.user_emails : [];
    const productTitle = r.products?.title || '';
    const base = {
      poolId: r.id,
      poolEmail: r.email,
      password: r.password,
      poolStatus: r.status,
      productTitle,
      slotIntent: r.slot_intent || '',
      poolCreatedAt: r.created_at,
      poolAssignedAt: r.assigned_at || '',
    };
    if (ues.length === 0) {
      out.push({
        ...base,
        userName: '',
        userEmail: '',
        assignmentAt: '',
        assignmentActive: false,
        orderStatus: '',
        userEmailRowId: `unassigned-${r.id}`,
      });
    } else {
      for (const ue of ues) {
        out.push({
          ...base,
          userName: ue.users?.name || '',
          userEmail: ue.users?.email || '',
          assignmentAt: ue.assigned_at || '',
          assignmentActive: ue.is_active,
          orderStatus: ue.orders?.status || '',
          userEmailRowId: ue.id,
        });
      }
    }
  }
  return out;
}
