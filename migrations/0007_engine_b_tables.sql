-- Engine B: CPA Tasks migration
-- Adds engine_b_tasks and engine_b_records tables.
-- daily_tasks and task_records are retained for historical data / FK integrity.

CREATE TABLE IF NOT EXISTS "engine_b_tasks" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "type" text NOT NULL DEFAULT 'cpa_offer',
  "action_url" text,
  "secret_code" text,
  "instructions" text,
  "target_rank" text DEFAULT 'C-Rank',
  "difficulty" text DEFAULT 'Easy',
  "is_active" boolean DEFAULT true,
  "gross_pkr_per_completion" numeric(10, 4) NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "engine_b_records" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "task_id" varchar NOT NULL REFERENCES "engine_b_tasks"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'pending',
  "clicked_at" timestamp,
  "completed_at" timestamp,
  CONSTRAINT "engine_b_records_unique_user_task" UNIQUE ("user_id", "task_id")
);

CREATE INDEX IF NOT EXISTS "engine_b_tasks_is_active_idx" ON "engine_b_tasks" ("is_active");
CREATE INDEX IF NOT EXISTS "engine_b_tasks_target_rank_idx" ON "engine_b_tasks" ("target_rank");
CREATE INDEX IF NOT EXISTS "engine_b_tasks_difficulty_idx" ON "engine_b_tasks" ("difficulty");
CREATE INDEX IF NOT EXISTS "engine_b_records_user_id_idx" ON "engine_b_records" ("user_id");
CREATE INDEX IF NOT EXISTS "engine_b_records_task_id_idx" ON "engine_b_records" ("task_id");
CREATE INDEX IF NOT EXISTS "engine_b_records_user_status_idx" ON "engine_b_records" ("user_id", "status");
