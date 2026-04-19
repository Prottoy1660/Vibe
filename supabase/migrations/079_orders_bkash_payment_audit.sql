-- Persist bKash tokenized payment details for admin visibility and Refund API.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS bkash_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS bkash_trx_id TEXT,
  ADD COLUMN IF NOT EXISTS bkash_msisdn TEXT,
  ADD COLUMN IF NOT EXISTS bkash_gateway_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS bkash_refund_trx_id TEXT;

COMMENT ON COLUMN public.orders.bkash_payment_id IS 'bKash create-payment paymentID (used with trx for refunds).';
COMMENT ON COLUMN public.orders.bkash_trx_id IS 'bKash execute payment trxID.';
COMMENT ON COLUMN public.orders.bkash_msisdn IS 'Customer wallet MSISDN from execute response.';
COMMENT ON COLUMN public.orders.bkash_gateway_amount IS 'Amount settled via bKash (gateway portion; used for refund amount).';
COMMENT ON COLUMN public.orders.bkash_refund_trx_id IS 'Last successful bKash refund transaction id.';
