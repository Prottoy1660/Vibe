CREATE OR REPLACE FUNCTION public.assign_available_email(target_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  available_email_id UUID;
  user_uuid UUID;
  current_month VARCHAR(7);
  log_id UUID;
  log_count INT;
BEGIN
  -- Get user_id from auth.uid()
  user_uuid := auth.uid();
  
  -- Verify the order belongs to the user and is valid
  IF NOT EXISTS (
    SELECT 1 FROM public.orders 
    WHERE id = target_order_id AND user_id = user_uuid AND status IN ('paid', 'completed')
  ) THEN
    RAISE EXCEPTION 'Invalid order or order not paid';
  END IF;

  current_month := to_char(CURRENT_DATE, 'YYYY-MM');

  -- Check log limit (max 3)
  SELECT id, count INTO log_id, log_count FROM public.email_generation_logs 
  WHERE user_id = user_uuid AND month = current_month;

  IF log_count >= 3 THEN
    RAISE EXCEPTION 'Monthly generation limit reached';
  END IF;

  -- Find an available email and lock it
  SELECT id INTO available_email_id
  FROM public.emails_pool
  WHERE status = 'available'
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF available_email_id IS NULL THEN
    RAISE EXCEPTION 'No available emails in the pool';
  END IF;

  -- Update email pool
  UPDATE public.emails_pool 
  SET status = 'assigned', assigned_at = NOW() 
  WHERE id = available_email_id;

  -- Insert into user_emails
  INSERT INTO public.user_emails (user_id, email_id, order_id, is_active)
  VALUES (user_uuid, available_email_id, target_order_id, true);

  -- Update generation logs
  IF log_id IS NULL THEN
    INSERT INTO public.email_generation_logs (user_id, count, month)
    VALUES (user_uuid, 1, current_month);
  ELSE
    UPDATE public.email_generation_logs
    SET count = count + 1
    WHERE id = log_id;
  END IF;

  RETURN json_build_object('success', true, 'email_id', available_email_id);
END;
$$;