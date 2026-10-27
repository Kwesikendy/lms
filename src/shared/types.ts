export type UserRole = 'student' | 'instructor' | 'admin';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  title?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  status: 'active' | 'suspended';
  email_verified: boolean;
  notification_prefs: {
    email_classes: boolean;
    email_receipts: boolean;
    in_app: boolean;
  };
  created_at: string;
}

export interface PlatformSettings {
  org_name: string;
  org_tagline: string;
  support_email: string;
  primary_currency: string;
  accent_color: string;
  paystack_enabled: boolean;
  hubtel_enabled: boolean;
  livekit_enabled: boolean;
  allow_registration: boolean;
}

export interface CourseCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order: number;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description: string;
  category_id?: string | null;
  category_name?: string | null;
  instructor_id: string;
  instructor_name?: string;
  instructor_title?: string | null;
  instructor_bio?: string | null;
  instructor_avatar?: string | null;
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'All Levels';
  duration_hours: number;
  artwork_url?: string | null;
  preview_video_url?: string | null;
  learning_outcomes: string[];
  requirements: string[];
  is_free: boolean;
  price_ghs: number;
  currency: string;
  status: 'draft' | 'published' | 'archived';
  featured: boolean;
  product_id?: string | null;
  lesson_count?: number;
  enrollment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description?: string | null;
  sort_order: number;
  lessons: Lesson[];
}

export interface Lesson {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  description?: string | null;
  content_type: 'video' | 'document' | 'article' | 'quiz';
  video_url?: string | null;
  document_url?: string | null;
  article_body?: string | null;
  duration_minutes: number;
  is_preview: boolean;
  allow_download: boolean;
  sort_order: number;
  completed?: boolean;
  playback_position_sec?: number;
  locked?: boolean;
}

export interface LearningResource {
  id: string;
  slug: string;
  title: string;
  description: string;
  resource_type: 'book' | 'pdf' | 'video' | 'template' | 'audio' | 'presentation';
  author_id: string;
  author_name?: string;
  course_id?: string | null;
  course_title?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  file_key: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  preview_url?: string | null;
  artwork_url?: string | null;
  page_count?: number | null;
  is_free: boolean;
  price_ghs: number;
  currency: string;
  allow_download: boolean;
  status: 'draft' | 'published' | 'archived';
  product_id?: string | null;
  has_access?: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string;
  title: string;
  description?: string | null;
  product_type: 'course' | 'resource' | 'bundle';
  target_course_id?: string | null;
  target_resource_id?: string | null;
  price_ghs: number;
  currency: string;
  active: boolean;
  bundle_items?: Array<{
    id: string;
    item_type: 'course' | 'resource';
    course_id?: string | null;
    resource_id?: string | null;
    title: string;
  }>;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  subtotal_amount: number;
  total_amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded' | 'partially_refunded';
  payment_provider: 'paystack' | 'hubtel' | 'free';
  payment_method?: string | null;
  customer_phone?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  refund_reason?: string | null;
  created_at: string;
  items?: Array<{
    id: string;
    product_id: string;
    title_snapshot: string;
    unit_price: number;
    currency: string;
  }>;
  attempts?: Array<{
    id: string;
    provider: string;
    reference: string;
    amount: number;
    status: string;
    channel?: string | null;
    verified_at?: string | null;
    created_at: string;
  }>;
}

export interface Entitlement {
  id: string;
  user_id: string;
  target_type: 'course' | 'resource';
  target_id: string;
  source: 'purchase' | 'free_enrollment' | 'admin_grant' | 'bundle';
  order_id?: string | null;
  status: 'active' | 'revoked' | 'expired';
  granted_at: string;
  expires_at?: string | null;
}

export interface LiveSession {
  id: string;
  course_id: string;
  course_title?: string;
  instructor_id: string;
  instructor_name?: string;
  title: string;
  description?: string | null;
  room_name: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  actual_started_at?: string | null;
  actual_ended_at?: string | null;
  status: 'scheduled' | 'live' | 'ended' | 'canceled';
  is_public: boolean;
  recording_enabled: boolean;
  recording_status: 'none' | 'starting' | 'recording' | 'completed' | 'failed';
  egress_id?: string | null;
  recording_url?: string | null;
  max_participants: number;
  attendance_count?: number;
}

export interface Quiz {
  id: string;
  course_id: string;
  course_title?: string;
  lesson_id?: string | null;
  title: string;
  description?: string | null;
  passing_score: number;
  questions: Array<{
    id: string;
    prompt: string;
    options: string[];
    correct_option_index?: number;
    explanation?: string | null;
  }>;
  latest_attempt?: {
    id: string;
    score_percent: number;
    passed: boolean;
    submitted_at: string;
  } | null;
}

export interface Assignment {
  id: string;
  course_id: string;
  course_title?: string;
  title: string;
  instructions: string;
  due_days: number;
  max_score: number;
  submission?: {
    id: string;
    submission_text: string;
    attachment_url?: string | null;
    status: 'submitted' | 'graded' | 'revision_requested';
    score?: number | null;
    feedback?: string | null;
    submitted_at: string;
    graded_at?: string | null;
  } | null;
}
