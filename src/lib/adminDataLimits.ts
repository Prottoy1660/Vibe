/** Max rows for heavy admin order queries (API + Supabase). Keeps JSON parse and charts responsive. */
export const ADMIN_ORDERS_QUERY_LIMIT = 2500;

/** Page size when batch-loading users for admin User Management. */
export const ADMIN_USERS_FETCH_PAGE_SIZE = 1000;

/** Page size when batch-loading SMS history rows. */
export const ADMIN_SMS_FETCH_PAGE_SIZE = 1000;
