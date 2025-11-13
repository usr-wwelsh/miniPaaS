-- Add error_message column to deployments table
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS error_type VARCHAR(100);

-- Create index for faster error queries
CREATE INDEX IF NOT EXISTS idx_deployments_error ON deployments(error_type) WHERE error_type IS NOT NULL;
