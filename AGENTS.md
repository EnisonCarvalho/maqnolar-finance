<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Roles live only in `public.user_roles`, are assigned explicitly by admins via `set_user_role` (never by signup order), and are checked with `has_role()` which also requires `profiles.active`; first admin only via `bootstrap_first_admin()` while no active admin exists. Triggers audit every change and block removing the last active admin.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate); sign-in is `/auth`.
- Financial writes must go through server functions/SQL functions that compute amounts server-side, with values stored in integer cents (auditable, no client-trusted totals).
- Theme preference is stored per user in `profiles.theme` and mirrored to localStorage for instant apply.
- Settlement balances are computed only from actual customer payments via `src/lib/ledger-math.ts` (shared by server functions and UI); payments, transfers and closings are never deleted or edited in place — they are voided/reopened with a reason, enforced by DB triggers. Why: auditable money trail.
- Cash flow and financial indicators are computed only via `src/lib/cashflow-math.ts` from existing module records (no duplicated revenue/expense rows): technician-received payments stay out of company cash; technician transfers, part reimbursements and account transfers move cash but never count as revenue/expense. Closed months block dated writes via `assert_month_open()` in DB triggers. Server functions must use a literal `createServerFn(...).middleware(...)` chain per export (factory helpers break the compiler). Why: single auditable source of truth.
- Campaign investment comes only from allocations of existing `expenses` (`campaign_expense_allocations`, sum per expense capped by a DB trigger, removed with a reason, never deleted); totals and performance/ROI (company share from `order_financials` only, attributed by `service_orders.campaign_id`) via `src/lib/campaign-math.ts`. Why: no duplicated expense rows.
- Lead/order attribution (origin, campaign_id, creative_code) is copied onto each service_order at conversion and changes only via `correctOrigin` (logs `origin_corrections`, enforced by `guard_order_origin` trigger); one order per lead via unique `service_orders.lead_id`; counts via `src/lib/lead-math.ts`. Why: preserved historical origin.
- Partner movements (`partner_movements`: aporte, empréstimo, devolução, retirada) move company account balances via `cashflow-math.ts` but never count as revenue/expense; partners are active admins (no new role); records are immutable — corrections only by void with reason; per-partner totals via `src/lib/partner-math.ts`. Why: capital/loans separated from operational result.
