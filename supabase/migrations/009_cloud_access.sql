-- Add cloud_access_type to emails_pool
ALTER TABLE emails_pool ADD COLUMN IF NOT EXISTS cloud_access_type TEXT DEFAULT 'none';

-- Add with_cloud_access to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS with_cloud_access BOOLEAN DEFAULT false;
