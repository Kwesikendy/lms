-- ============================================================================
-- AETHER LMS — PRODUCTION POSTGRESQL SCHEMA (migrations/001_initial_schema.postgres.sql)
-- Normalized relational domain model for courses, resources, products, orders,
-- payment attempts/events, entitlements, LiveKit sessions, assessments & audit logs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(120) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(180) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('student', 'instructor', 'admin')),
  title VARCHAR(180),
  bio TEXT,
  avatar_url TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  notification_prefs JSONB NOT NULL DEFAULT '{"email_classes":true,"email_receipts":true,"in_app":true}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_categories (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS courses (
  id VARCHAR(64) PRIMARY KEY,
  slug VARCHAR(180) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  subtitle TEXT,
  description TEXT NOT NULL,
  category_id VARCHAR(64) REFERENCES course_categories(id) ON DELETE SET NULL,
  instructor_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  level VARCHAR(32) NOT NULL DEFAULT 'Intermediate' CHECK (level IN ('Beginner', 'Intermediate', 'Advanced', 'All Levels')),
  duration_hours NUMERIC(6,1) NOT NULL DEFAULT 0,
  artwork_url TEXT,
  preview_video_url TEXT,
  learning_outcomes JSONB NOT NULL DEFAULT '[]',
  requirements JSONB NOT NULL DEFAULT '[]',
  is_free BOOLEAN NOT NULL DEFAULT FALSE,
  price_ghs NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_status_category ON courses(status, category_id);
CREATE INDEX IF NOT EXISTS idx_courses_instructor ON courses(instructor_id);

CREATE TABLE IF NOT EXISTS course_modules (
  id VARCHAR(64) PRIMARY KEY,
  course_id VARCHAR(64) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modules_course_order ON course_modules(course_id, sort_order);

CREATE TABLE IF NOT EXISTS lessons (
  id VARCHAR(64) PRIMARY KEY,
  module_id VARCHAR(64) NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  course_id VARCHAR(64) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content_type VARCHAR(32) NOT NULL DEFAULT 'video' CHECK (content_type IN ('video', 'document', 'article', 'quiz')),
  video_url TEXT,
  document_url TEXT,
  article_body TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 10,
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,
  allow_download BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lessons_course_module ON lessons(course_id, module_id, sort_order);

CREATE TABLE IF NOT EXISTS learning_resources (
  id VARCHAR(64) PRIMARY KEY,
  slug VARCHAR(180) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  resource_type VARCHAR(32) NOT NULL CHECK (resource_type IN ('book', 'pdf', 'video', 'template', 'audio', 'presentation')),
  author_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  course_id VARCHAR(64) REFERENCES courses(id) ON DELETE SET NULL,
  category_id VARCHAR(64) REFERENCES course_categories(id) ON DELETE SET NULL,
  file_key TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  mime_type VARCHAR(120) NOT NULL DEFAULT 'application/pdf',
  preview_url TEXT,
  artwork_url TEXT,
  page_count INTEGER,
  is_free BOOLEAN NOT NULL DEFAULT FALSE,
  price_ghs NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
  allow_download BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(32) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resources_status_type ON learning_resources(status, resource_type);

-- Separates purchasable commercial offerings (course, resource, bundle) from curriculum tables
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  sku VARCHAR(120) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  product_type VARCHAR(32) NOT NULL CHECK (product_type IN ('course', 'resource', 'bundle')),
  target_course_id VARCHAR(64) REFERENCES courses(id) ON DELETE CASCADE,
  target_resource_id VARCHAR(64) REFERENCES learning_resources(id) ON DELETE CASCADE,
  price_ghs NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_prices (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bundle_items (
  id VARCHAR(64) PRIMARY KEY,
  bundle_product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_type VARCHAR(32) NOT NULL CHECK (item_type IN ('course', 'resource')),
  course_id VARCHAR(64) REFERENCES courses(id) ON DELETE CASCADE,
  resource_id VARCHAR(64) REFERENCES learning_resources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  order_number VARCHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subtotal_amount NUMERIC(12,2) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'canceled', 'refunded', 'partially_refunded')),
  payment_provider VARCHAR(32) NOT NULL DEFAULT 'paystack' CHECK (payment_provider IN ('paystack', 'hubtel', 'free')),
  payment_method VARCHAR(64),
  customer_phone VARCHAR(32),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);

CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  title_snapshot VARCHAR(255) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'GHS'
);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('paystack', 'hubtel')),
  reference VARCHAR(128) NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
  channel VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'canceled', 'refunded')),
  authorization_url TEXT,
  provider_response JSONB,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id);

CREATE TABLE IF NOT EXISTS payment_events (
  id VARCHAR(64) PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  event_id VARCHAR(180) NOT NULL,
  reference VARCHAR(128),
  event_type VARCHAR(120) NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, event_id)
);

CREATE TABLE IF NOT EXISTS entitlements (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(32) NOT NULL CHECK (target_type IN ('course', 'resource')),
  target_id VARCHAR(64) NOT NULL,
  source VARCHAR(32) NOT NULL CHECK (source IN ('purchase', 'free_enrollment', 'admin_grant', 'bundle')),
  order_id VARCHAR(64) REFERENCES orders(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_target ON entitlements(user_id, target_type, target_id, status);

CREATE TABLE IF NOT EXISTS enrollments (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(64) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  entitlement_id VARCHAR(64) REFERENCES entitlements(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'revoked')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_accessed_lesson_id VARCHAR(64),
  last_accessed_at TIMESTAMPTZ,
  UNIQUE(user_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(64) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  playback_position_sec INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id VARCHAR(64) PRIMARY KEY,
  course_id VARCHAR(64) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  instructor_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  room_name VARCHAR(128) NOT NULL UNIQUE,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  actual_started_at TIMESTAMPTZ,
  actual_ended_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'canceled')),
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recording_status VARCHAR(32) NOT NULL DEFAULT 'none' CHECK (recording_status IN ('none', 'starting', 'recording', 'completed', 'failed')),
  egress_id VARCHAR(128),
  recording_url TEXT,
  max_participants INTEGER NOT NULL DEFAULT 150,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_course_status ON live_sessions(course_id, status);

CREATE TABLE IF NOT EXISTS session_attendance (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quizzes (
  id VARCHAR(64) PRIMARY KEY,
  course_id VARCHAR(64) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id VARCHAR(64) REFERENCES lessons(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  passing_score INTEGER NOT NULL DEFAULT 70,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id VARCHAR(64) PRIMARY KEY,
  quiz_id VARCHAR(64) NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option_index INTEGER NOT NULL,
  explanation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id VARCHAR(64) PRIMARY KEY,
  quiz_id VARCHAR(64) NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score_percent INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  answers JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignments (
  id VARCHAR(64) PRIMARY KEY,
  course_id VARCHAR(64) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  instructions TEXT NOT NULL,
  due_days INTEGER NOT NULL DEFAULT 7,
  max_score INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id VARCHAR(64) PRIMARY KEY,
  assignment_id VARCHAR(64) NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_text TEXT NOT NULL,
  attachment_url TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'revision_requested')),
  score INTEGER,
  feedback TEXT,
  graded_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graded_at TIMESTAMPTZ,
  UNIQUE(assignment_id, user_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id VARCHAR(64) PRIMARY KEY,
  course_id VARCHAR(64) REFERENCES courses(id) ON DELETE CASCADE,
  author_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  audience VARCHAR(32) NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'course', 'instructors')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(255),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(32),
  action VARCHAR(120) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(64),
  metadata JSONB,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
