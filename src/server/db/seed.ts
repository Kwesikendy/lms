import { getDb, newId, nowIso, withTransaction } from './index.js';
import { hashPassword } from '../middleware/auth.js';
import { grantEntitlement } from '../services/entitlements.js';
import { storePrivateObject } from '../services/storage.js';

export function ensureSeedData(): void {
  const db = getDb();
  const userCount = (
    db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }
  ).c;

  if (userCount === 0) {
    withTransaction((tx) => {
      const now = nowIso();

      // 1. Configurable Platform Settings (No hardcoded org names in UI)
      const defaultSettings: Record<string, string> = {
        org_name: 'Aether Academy',
        org_tagline: 'Practical technology courses, live classes and a digital library',
        support_email: 'admissions@aetheracademy.edu.gh',
        primary_currency: 'GHS',
        accent_color: '#22D3EE',
        paystack_enabled: 'true',
        hubtel_enabled: 'true',
        livekit_enabled: 'true',
        allow_registration: 'true',
      };

    for (const [k, v] of Object.entries(defaultSettings)) {
      tx.prepare(
        `INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)`
      ).run(k, v, now);
    }

    // 2. Core Users (Admin, 2 Instructors, 2 Students)
    const adminId = 'usr_admin_01';
    const inst1Id = 'usr_inst_01';
    const inst2Id = 'usr_inst_02';
    const student1Id = 'usr_stud_01';
    const student2Id = 'usr_stud_02';

    const defaultPass = hashPassword('Password123!');

    const users = [
      {
        id: adminId,
        email: 'admin@aetheracademy.edu.gh',
        full_name: 'Nana Ama Mensah',
        role: 'admin',
        title: 'Director of Academic Operations',
        bio: 'Leads curriculum accreditation, financial governance, and digital learning operations across West Africa.',
      },
      {
        id: inst1Id,
        email: 'kwame.asante@aetheracademy.edu.gh',
        full_name: 'Dr. Kwame Asante',
        role: 'instructor',
        title: 'Principal Distributed Systems Architect',
        bio: 'Former Principal Engineer building high-throughput payment switches and cloud-native infrastructure across Africa and Europe.',
      },
      {
        id: inst2Id,
        email: 'efua.danquah@aetheracademy.edu.gh',
        full_name: 'Efua Danquah',
        role: 'instructor',
        title: 'Lead Design Systems & Product Strategist',
        bio: 'Award-winning interface architect specializing in spatial computing, glassmorphic design systems, and WCAG accessibility.',
      },
      {
        id: student1Id,
        email: 'kofi.student@aetheracademy.edu.gh',
        full_name: 'Kofi Boateng',
        role: 'student',
        title: 'Full-Stack Software Engineer',
        bio: 'Building resilient financial and educational products in Accra.',
      },
      {
        id: student2Id,
        email: 'akua.learner@aetheracademy.edu.gh',
        full_name: 'Akua Osei',
        role: 'student',
        title: 'Product Designer & Frontend Developer',
        bio: 'Focused on high-craft UI engineering and real-time collaboration tools.',
      },
      {
        id: 'usr_stud_demo',
        email: 'student@lms.local',
        full_name: 'Kofi Boateng',
        role: 'student',
        title: 'Full-Stack Software Engineer',
        bio: 'Building resilient financial and educational products.',
      },
      {
        id: 'usr_inst_demo',
        email: 'instructor@lms.local',
        full_name: 'Dr. Kwame Asante',
        role: 'instructor',
        title: 'Principal Distributed Systems Architect',
        bio: 'Leading real-time WebRTC and distributed systems engineering.',
      },
      {
        id: 'usr_admin_demo',
        email: 'admin@lms.local',
        full_name: 'Nana Ama Mensah',
        role: 'admin',
        title: 'Director of Academic Operations',
        bio: 'Platform administration and institutional governance.',
      },
    ];

    for (const u of users) {
      tx.prepare(
        `INSERT INTO users (id, email, password_hash, full_name, role, title, bio, status, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`
      ).run(u.id, u.email, defaultPass, u.full_name, u.role, u.title, u.bio, now, now);
    }

    // 3. Categories
    const categories = [
      {
        id: 'cat_cloud',
        name: 'Cloud & Distributed Systems',
        slug: 'cloud-distributed-systems',
        description: 'High-availability backend architecture, Kubernetes, and real-time WebRTC infrastructure.',
        sort_order: 1,
      },
      {
        id: 'cat_fintech',
        name: 'FinTech & Payment Engineering',
        slug: 'fintech-payment-engineering',
        description: 'Mobile Money switches, ledger design, Paystack/Hubtel webhooks, and PCI-grade security.',
        sort_order: 2,
      },
      {
        id: 'cat_design',
        name: 'Design Systems & UI Craft',
        slug: 'design-systems-ui-craft',
        description: 'Glassmorphism, token architecture, motion choreography, and accessible React interfaces.',
        sort_order: 3,
      },
      {
        id: 'cat_ai',
        name: 'Applied AI & Data Engineering',
        slug: 'applied-ai-data',
        description: 'Production LLM pipelines, retrieval-augmented generation, and telemetry analytics.',
        sort_order: 4,
      },
    ];

    for (const c of categories) {
      tx.prepare(
        `INSERT INTO course_categories (id, name, slug, description, sort_order) VALUES (?, ?, ?, ?, ?)`
      ).run(c.id, c.name, c.slug, c.description, c.sort_order);
    }

    // 4. Courses (1 Free Course, 3 Paid Courses)
    const courses = [
      {
        id: 'crs_fintech_arch',
        slug: 'fintech-payment-switches-ghana',
        title: 'Engineering Resilient FinTech & Mobile Money Ledgers',
        subtitle: 'Architect double-entry ledgers, idempotent Paystack & Hubtel webhooks, and automated reconciliation engines.',
        description:
          'A rigorous engineering program designed for software engineers building financial infrastructure in Ghana and across Africa. You will design ACID double-entry ledgers, handle asynchronous Mobile Money callbacks safely, prevent replay and race conditions, and build real-time reconciliation dashboards.',
        category_id: 'cat_fintech',
        instructor_id: inst1Id,
        level: 'Advanced',
        duration_hours: 18.5,
        artwork_url: 'gradient:indigo-cyan',
        learning_outcomes: JSON.stringify([
          'Design immutable double-entry ledger schemas in PostgreSQL',
          'Implement HMAC-SHA512 webhook verification and idempotency keys for Paystack & Hubtel',
          'Handle Mobile Money timeout states, delayed callbacks, and automated settlement reconciliation',
          'Audit financial workflows against OWASP API Security Top 10',
        ]),
        requirements: JSON.stringify([
          'Working knowledge of TypeScript or Go and relational SQL',
          'Familiarity with HTTP APIs and database transactions',
        ]),
        is_free: 0,
        price_ghs: 850,
        status: 'published',
        featured: 1,
      },
      {
        id: 'crs_glass_ui',
        slug: 'spatial-glassmorphism-design-systems',
        title: 'Spatial Glassmorphism & Accessible Design Systems',
        subtitle: 'Master three-layer CSS token architecture, translucent depth, Framer Motion choreography, and WCAG 2.2 AA compliance.',
        description:
          'Move beyond generic templates and learn how award-winning product teams craft atmospheric, high-contrast glassmorphic interfaces. Covers primitive-to-component token pipelines, optical border luminance, keyboard focus traps, and low-latency motion.',
        category_id: 'cat_design',
        instructor_id: inst2Id,
        level: 'Intermediate',
        duration_hours: 14.0,
        artwork_url: 'gradient:violet-cyan',
        learning_outcomes: JSON.stringify([
          'Build a 3-layer design token system (Primitive, Semantic, Component)',
          'Balance backdrop-filter blur with crisp typographic readability on long-form screens',
          'Choreograph spring-physics transitions that respect prefers-reduced-motion',
          'Verify WCAG 2.2 AA contrast ratios across translucent dark surfaces',
        ]),
        requirements: JSON.stringify([
          'Modern CSS and React component fundamentals',
        ]),
        is_free: 0,
        price_ghs: 620,
        status: 'published',
        featured: 1,
      },
      {
        id: 'crs_webrtc_livekit',
        slug: 'realtime-webrtc-livekit-infrastructure',
        title: 'Foundations of Real-Time WebRTC & LiveKit Classrooms',
        subtitle: 'Free foundational course on SFU media routing, server-signed room tokens, and adaptive video streaming.',
        description:
          'Understand how modern real-time audio, video, and data channels work under the hood. Learn the difference between P2P mesh and Selective Forwarding Units (SFUs), how LiveKit room grants secure multi-role sessions, and how to handle network reconnections gracefully.',
        category_id: 'cat_cloud',
        instructor_id: inst1Id,
        level: 'Beginner',
        duration_hours: 8.5,
        artwork_url: 'gradient:emerald-cyan',
        learning_outcomes: JSON.stringify([
          'Understand WebRTC signaling, ICE/STUN/TURN, and SFU architecture',
          'Mint short-lived server-side LiveKit tokens with granular room permissions',
          'Handle camera/microphone track publication, dynacast, and adaptive simulcast',
          'Design resilient classroom state machines and attendance logs',
        ]),
        requirements: JSON.stringify([
          'Basic JavaScript/TypeScript programming experience',
        ]),
        is_free: 1,
        price_ghs: 0,
        status: 'published',
        featured: 1,
      },
      {
        id: 'crs_ai_rag',
        slug: 'production-ai-agents-rag-systems',
        title: 'Production AI Agents & Enterprise RAG Systems',
        subtitle: 'Build grounded retrieval pipelines, semantic vector indexing, and evaluation harnesses.',
        description:
          'A practical engineering deep-dive into deploying reliable AI systems in production. Learn hybrid lexical + vector search, citation verification, latency budgeting, and strict access-control filtering.',
        category_id: 'cat_ai',
        instructor_id: inst1Id,
        level: 'Advanced',
        duration_hours: 16.0,
        artwork_url: 'gradient:blue-purple',
        learning_outcomes: JSON.stringify([
          'Architect hybrid retrieval pipelines with tenant-isolated permissions',
          'Build automated evaluation suites to measure hallucination and recall',
          'Stream structured responses with deterministic fallback handling',
        ]),
        requirements: JSON.stringify([
          'Backend engineering experience with Node.js or Python',
        ]),
        is_free: 0,
        price_ghs: 950,
        status: 'published',
        featured: 0,
      },
    ];

    for (const c of courses) {
      tx.prepare(
        `INSERT INTO courses (
           id, slug, title, subtitle, description, category_id, instructor_id,
           level, duration_hours, artwork_url, learning_outcomes, requirements,
           is_free, price_ghs, currency, status, featured, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GHS', ?, ?, ?, ?)`
      ).run(
        c.id,
        c.slug,
        c.title,
        c.subtitle,
        c.description,
        c.category_id,
        c.instructor_id,
        c.level,
        c.duration_hours,
        c.artwork_url,
        c.learning_outcomes,
        c.requirements,
        c.is_free,
        c.price_ghs,
        c.status,
        c.featured,
        now,
        now
      );

      // Create corresponding product for each course
      const prodId = `prd_${c.id}`;
      tx.prepare(
        `INSERT INTO products (id, sku, title, description, product_type, target_course_id, price_ghs, currency, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'course', ?, ?, 'GHS', 1, ?, ?)`
      ).run(
        prodId,
        `SKU-${c.slug.toUpperCase().slice(0, 20)}`,
        c.title,
        c.subtitle,
        c.id,
        c.price_ghs,
        now,
        now
      );

      tx.prepare(
        `INSERT INTO product_prices (id, product_id, amount, currency, effective_from)
         VALUES (?, ?, ?, 'GHS', ?)`
      ).run(newId('prc'), prodId, c.price_ghs, now);
    }

    // 5. Modules & Lessons for courses
    const modulesAndLessons = [
      {
        id: 'mod_fin_1',
        course_id: 'crs_fintech_arch',
        title: 'Module 1: Double-Entry Ledger Architecture & ACID Guarantees',
        description: 'Designing immutable financial accounts, journal entries, and balance locks.',
        sort_order: 1,
        lessons: [
          {
            id: 'les_fin_1_1',
            title: 'Why Floating-Point Math & Naive Balance Columns Fail',
            description: 'Analysis of concurrency anomalies, lost updates, and precision errors in payment systems.',
            content_type: 'video',
            duration_minutes: 22,
            is_preview: 1,
            allow_download: 0,
            article_body: `### Core Architectural Principle\nNever store a mutable \`balance\` column without an append-only ledger journal. Every movement of funds in GHS or USD must be recorded as balanced debit and credit lines inside a serializable or immediate database transaction.\n\n- **Idempotency Keys**: Every external mutation requires a unique client reference.\n- **Integer Minor Units**: Store Pesewas/Cents or fixed-precision NUMERIC(12,2) values.`,
            sort_order: 1,
          },
          {
            id: 'les_fin_1_2',
            title: 'Implementing Idempotent Paystack & Hubtel Webhook Receivers',
            description: 'Step-by-step implementation of HMAC-SHA512 signature verification and replay protection.',
            content_type: 'article',
            duration_minutes: 30,
            is_preview: 0,
            allow_download: 1,
            article_body: `### Verifying Provider Webhooks Server-Side\n1. Read the raw request payload before trusting any field.\n2. Compute \`HMAC-SHA512\` using your \`PAYSTACK_WEBHOOK_SECRET\`.\n3. Compare digests using \`crypto.timingSafeEqual\`.\n4. Insert \`(provider, event_id)\` into \`payment_events\` with a \`UNIQUE\` constraint inside the same transaction that transitions the order state and grants entitlements.`,
            sort_order: 2,
          },
          {
            id: 'les_fin_1_3',
            title: 'Automated Daily Settlement & Mobile Money Reconciliation',
            description: 'Matching provider settlement files against internal payment attempts and handling discrepancies.',
            content_type: 'document',
            duration_minutes: 25,
            is_preview: 0,
            allow_download: 1,
            article_body: `### Settlement Reconciliation Workflow\nCompare internal \`orders (status = 'paid')\` against provider settlement batches. Flag any order where \`payment_attempts.amount\` diverges from the order total or where a callback arrived after timeout.`,
            sort_order: 3,
          },
        ],
      },
      {
        id: 'mod_glass_1',
        course_id: 'crs_glass_ui',
        title: 'Module 1: Optical Depth, Translucent Surfaces & Token Systems',
        description: 'Building a 3-tier token pipeline for midnight glassmorphism.',
        sort_order: 1,
        lessons: [
          {
            id: 'les_glass_1_1',
            title: 'Three-Layer Token Architecture: Primitive → Semantic → Component',
            description: 'Structuring CSS custom properties for atmospheric lighting, blur radii, and specular borders.',
            content_type: 'video',
            duration_minutes: 18,
            is_preview: 1,
            allow_download: 1,
            article_body: `### Restraint in Glassmorphism\nUse translucent backdrop blur for navigation chrome, floating toolbars, contextual sidebars, and live classroom control surfaces. Keep long-form reading surfaces, data tables, and PDF viewers grounded on high-contrast opaque or semi-opaque midnight slate panels so typography remains effortless to read.`,
            sort_order: 1,
          },
          {
            id: 'les_glass_1_2',
            title: 'WCAG 2.2 AA Contrast & Keyboard Focus Engineering',
            description: 'Ensuring translucent components remain accessible across keyboard, screen reader, and reduced-motion modes.',
            content_type: 'article',
            duration_minutes: 24,
            is_preview: 0,
            allow_download: 1,
            article_body: `### Accessibility Checklist for Glass UI\n- Maintain at least 4.5:1 contrast for body copy.\n- Provide high-visibility cyan/indigo focus rings (\`:focus-visible\`).\n- Honor \`@media (prefers-reduced-motion: reduce)\` by disabling ambient background drift and shortening transitions.`,
            sort_order: 2,
          },
        ],
      },
      {
        id: 'mod_webrtc_1',
        course_id: 'crs_webrtc_livekit',
        title: 'Module 1: LiveKit Architecture & Secure Token Minting',
        description: 'Understanding SFU rooms, participant identities, and server-side token grants.',
        sort_order: 1,
        lessons: [
          {
            id: 'les_webrtc_1_1',
            title: 'How Selective Forwarding Units (SFUs) Scale Live Classrooms',
            description: 'Comparing P2P mesh topologies with LiveKit SFU media routing and simulcast.',
            content_type: 'video',
            duration_minutes: 20,
            is_preview: 1,
            allow_download: 1,
            article_body: `### LiveKit SFU Architecture\nIn an online classroom with 50 students and 1 instructor, a peer-to-peer mesh would require every student device to encode and upload 50 separate media streams. A Selective Forwarding Unit (SFU) like LiveKit receives each publisher's upstream once and forwards adaptive simulcast layers to subscribers based on their viewport size and bandwidth.`,
            sort_order: 1,
          },
          {
            id: 'les_webrtc_1_2',
            title: 'Server-Side Access Control & Short-Lived Room Grants',
            description: 'Why API secrets must never leave the backend and how to map LMS roles to LiveKit VideoGrants.',
            content_type: 'article',
            duration_minutes: 25,
            is_preview: 1,
            allow_download: 1,
            article_body: `### Securing Classroom Entry\n1. Authenticate the user session on the server.\n2. Verify the student holds an active course entitlement (or is the assigned instructor).\n3. Mint a short-lived JWT with \`livekit-server-sdk\` setting \`roomAdmin: true\` only for the instructor/admin and binding \`identity\` to the authenticated user ID.`,
            sort_order: 2,
          },
        ],
      },
    ];

    for (const mod of modulesAndLessons) {
      tx.prepare(
        `INSERT INTO course_modules (id, course_id, title, description, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(mod.id, mod.course_id, mod.title, mod.description, mod.sort_order, now);

      for (const les of mod.lessons) {
        tx.prepare(
          `INSERT INTO lessons (
             id, module_id, course_id, title, description, content_type,
             video_url, document_url, article_body, duration_minutes,
             is_preview, allow_download, sort_order, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          les.id,
          mod.id,
          mod.course_id,
          les.title,
          les.description,
          les.content_type,
          `/api/media/lesson/${les.id}`,
          `/api/media/lesson/${les.id}`,
          les.article_body,
          les.duration_minutes,
          les.is_preview,
          les.allow_download,
          les.sort_order,
          now
        );
      }
    }

    // 6. Learning Resources (Books, PDFs, Templates — Free & Paid)
    const resources = [
      {
        id: 'res_fintech_handbook',
        slug: 'west-african-fintech-architecture-handbook',
        title: 'The West African FinTech & Mobile Money Architecture Handbook (2026 Edition)',
        description:
          '210-page comprehensive engineering manual covering GHS Mobile Money integration patterns, ledger schemas, webhook idempotency, and Bank of Ghana compliance checklists.',
        resource_type: 'book',
        author_id: inst1Id,
        course_id: 'crs_fintech_arch',
        category_id: 'cat_fintech',
        file_key: 'books/fintech-architecture-handbook-2026.pdf',
        file_name: 'fintech-architecture-handbook-2026.pdf',
        file_size_bytes: 4_850_000,
        mime_type: 'application/pdf',
        page_count: 210,
        is_free: 0,
        price_ghs: 180,
        allow_download: 1,
      },
      {
        id: 'res_glass_tokens',
        slug: 'aether-glassmorphism-design-tokens-kit',
        title: 'Aether Glassmorphism Token System & WCAG Contrast Guide',
        description:
          'Complete reference specification for 3-layer CSS variables, backdrop blur fallbacks, dark-mode contrast tables, and accessible component states.',
        resource_type: 'pdf',
        author_id: inst2Id,
        course_id: 'crs_glass_ui',
        category_id: 'cat_design',
        file_key: 'guides/aether-glass-tokens-spec.pdf',
        file_name: 'aether-glass-tokens-spec.pdf',
        file_size_bytes: 2_140_000,
        mime_type: 'application/pdf',
        page_count: 64,
        is_free: 1,
        price_ghs: 0,
        allow_download: 1,
      },
      {
        id: 'res_livekit_checklist',
        slug: 'livekit-production-deployment-runbook',
        title: 'LiveKit Production Classroom & Egress Deployment Runbook',
        description:
          'Step-by-step infrastructure guide for TURN/TLS setup, webhook signature validation, room state machines, and S3 Egress recording pipelines.',
        resource_type: 'pdf',
        author_id: inst1Id,
        course_id: 'crs_webrtc_livekit',
        category_id: 'cat_cloud',
        file_key: 'guides/livekit-production-runbook.pdf',
        file_name: 'livekit-production-runbook.pdf',
        file_size_bytes: 1_620_000,
        mime_type: 'application/pdf',
        page_count: 42,
        is_free: 0,
        price_ghs: 120,
        allow_download: 1,
      },
    ];

    for (const r of resources) {
      // Create private file artifact on disk so downloads & viewers stream real content
      storePrivateObject(
        r.file_key,
        `%PDF-1.4\n% Aether Academy Official Learning Resource: ${r.title}\n% Author ID: ${r.author_id}\n% Description: ${r.description}\n`
      );

      tx.prepare(
        `INSERT INTO learning_resources (
           id, slug, title, description, resource_type, author_id, course_id, category_id,
           file_key, file_name, file_size_bytes, mime_type, page_count,
           is_free, price_ghs, currency, allow_download, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GHS', ?, 'published', ?, ?)`
      ).run(
        r.id,
        r.slug,
        r.title,
        r.description,
        r.resource_type,
        r.author_id,
        r.course_id,
        r.category_id,
        r.file_key,
        r.file_name,
        r.file_size_bytes,
        r.mime_type,
        r.page_count,
        r.is_free,
        r.price_ghs,
        r.allow_download,
        now,
        now
      );

      const prodId = `prd_${r.id}`;
      tx.prepare(
        `INSERT INTO products (id, sku, title, description, product_type, target_resource_id, price_ghs, currency, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'resource', ?, ?, 'GHS', 1, ?, ?)`
      ).run(
        prodId,
        `SKU-${r.slug.toUpperCase().slice(0, 20)}`,
        r.title,
        r.description,
        r.id,
        r.price_ghs,
        now,
        now
      );
    }

    // 7. Create a Course + Resource Bundle Product
    const bundleProdId = 'prd_bundle_fintech_mastery';
    tx.prepare(
      `INSERT INTO products (id, sku, title, description, product_type, price_ghs, currency, active, created_at, updated_at)
       VALUES (?, 'SKU-BUNDLE-FINTECH-PRO', 'FinTech Engineering Complete Bundle (Course + Handbook)', 'Includes full enrollment in Engineering Resilient FinTech & Mobile Money Ledgers plus the 210-page West African FinTech Architecture Handbook.', 'bundle', 920, 'GHS', 1, ?, ?)`
    ).run(bundleProdId, now, now);

    tx.prepare(
      `INSERT INTO bundle_items (id, bundle_product_id, item_type, course_id, resource_id)
       VALUES (?, ?, 'course', 'crs_fintech_arch', NULL)`
    ).run(newId('bi'), bundleProdId);

    tx.prepare(
      `INSERT INTO bundle_items (id, bundle_product_id, item_type, course_id, resource_id)
       VALUES (?, ?, 'resource', NULL, 'res_fintech_handbook')`
    ).run(newId('bi'), bundleProdId);

    // 8. Enroll Student 1 (Kofi) in the free WebRTC course and one verified paid order for FinTech course
    grantEntitlement({
      db: tx,
      userId: student1Id,
      targetType: 'course',
      targetId: 'crs_webrtc_livekit',
      source: 'free_enrollment',
    });

    const paidOrderId = 'ord_seed_01';
    tx.prepare(
      `INSERT INTO orders (
         id, order_number, user_id, subtotal_amount, total_amount, currency,
         status, payment_provider, payment_method, customer_phone, paid_at, created_at, updated_at
       ) VALUES (?, 'AET-2026-8841', ?, 850, 850, 'GHS', 'paid', 'paystack', 'mobile_money', '+233244100200', ?, ?, ?)`
    ).run(paidOrderId, student1Id, now, now, now);

    tx.prepare(
      `INSERT INTO order_items (id, order_id, product_id, title_snapshot, unit_price, currency)
       VALUES ('oit_seed_01', ?, 'prd_crs_fintech_arch', 'Engineering Resilient FinTech & Mobile Money Ledgers', 850, 'GHS')`
    ).run(paidOrderId);

    tx.prepare(
      `INSERT INTO payment_attempts (
         id, order_id, provider, reference, amount, currency, channel, status, verified_at, created_at, updated_at
       ) VALUES ('att_seed_01', ?, 'paystack', 'REF_PAYSTACK_SEED_8841', 850, 'GHS', 'mobile_money', 'successful', ?, ?, ?)`
    ).run(paidOrderId, now, now, now);

    grantEntitlement({
      db: tx,
      userId: student1Id,
      targetType: 'course',
      targetId: 'crs_fintech_arch',
      source: 'purchase',
      orderId: paidOrderId,
    });

    // Mark 1st lesson of FinTech course completed for Student 1
    tx.prepare(
      `INSERT INTO lesson_progress (id, user_id, course_id, lesson_id, completed, playback_position_sec, completed_at, updated_at)
       VALUES (?, ?, 'crs_fintech_arch', 'les_fin_1_1', 1, 1320, ?, ?)`
    ).run(newId('prog'), student1Id, now, now);

    // 9. LiveKit Classroom Sessions
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const tomorrowStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const tomorrowEnd = new Date(Date.now() + 25.5 * 60 * 60 * 1000).toISOString();

    tx.prepare(
      `INSERT INTO live_sessions (
         id, course_id, instructor_id, title, description, room_name,
         scheduled_start_at, scheduled_end_at, actual_started_at, status,
         is_public, recording_enabled, recording_status, max_participants, created_at, updated_at
       ) VALUES (?, 'crs_fintech_arch', ?, 'Live Architecture Clinic: Idempotent Mobile Money Callbacks & Ledger Locks', 'Interactive code walkthrough and Q&A on handling delayed Paystack and Hubtel webhook deliveries.', 'aether-room-fintech-clinic-01', ?, ?, ?, 'live', 0, 1, 'none', 100, ?, ?)`
    ).run('ses_live_01', inst1Id, now, twoHoursFromNow, now, now, now);

    tx.prepare(
      `INSERT INTO live_sessions (
         id, course_id, instructor_id, title, description, room_name,
         scheduled_start_at, scheduled_end_at, status,
         is_public, recording_enabled, recording_status, max_participants, created_at, updated_at
       ) VALUES (?, 'crs_webrtc_livekit', ?, 'Public Masterclass: Inside WebRTC SFUs & LiveKit Token Security', 'Open technical session exploring low-latency WebRTC media routing and classroom permission boundaries.', 'aether-room-webrtc-open-02', ?, ?, 'scheduled', 1, 1, 'none', 250, ?, ?)`
    ).run('ses_sched_02', inst1Id, oneHourFromNow, twoHoursFromNow, now, now);

    tx.prepare(
      `INSERT INTO live_sessions (
         id, course_id, instructor_id, title, description, room_name,
         scheduled_start_at, scheduled_end_at, status,
         is_public, recording_enabled, recording_status, max_participants, created_at, updated_at
       ) VALUES (?, 'crs_glass_ui', ?, 'Design Critique: Optical Borders & Accessible Glass Surfaces', 'Live review of student design token hierarchies and keyboard focus navigation.', 'aether-room-glass-critique-03', ?, ?, 'scheduled', 0, 0, 'none', 80, ?, ?)`
    ).run('ses_sched_03', inst2Id, tomorrowStart, tomorrowEnd, now, now);

    // 10. Quizzes & Assignments
    const quiz1Id = 'qz_fintech_01';
    tx.prepare(
      `INSERT INTO quizzes (id, course_id, lesson_id, title, description, passing_score, created_at)
       VALUES (?, 'crs_fintech_arch', 'les_fin_1_2', 'Ledger Integrity & Webhook Verification Assessment', 'Verify your understanding of cryptographic webhook signatures, idempotency, and double-entry constraints.', 70, ?)`
    ).run(quiz1Id, now);

    const quizQuestions = [
      {
        id: 'qq_1',
        prompt: 'Why must a payment entitlement NEVER be activated solely from a browser redirect query parameter (e.g., ?status=success)?',
        options: JSON.stringify([
          'Because query parameters can be trivially forged or modified by any user in the browser address bar without completing payment',
          'Because query parameters slow down page rendering',
          'Because browsers block query parameters on HTTPS',
          'Because CSS variables cannot read URL parameters',
        ]),
        correct_option_index: 0,
        explanation:
          'Client-supplied URL parameters are untrusted user input. Only a cryptographically verified server-side webhook or authenticated server-to-provider verification call proves payment occurred.',
        sort_order: 1,
      },
      {
        id: 'qq_2',
        prompt: 'How should duplicate webhook deliveries from Paystack or Hubtel be handled by the backend?',
        options: JSON.stringify([
          'Process every webhook and grant duplicate entitlements',
          'Enforce a UNIQUE constraint on (provider, event_id) inside a database transaction and return an idempotent success response if already processed',
          'Disable webhooks after the first payment',
          'Store webhook state only in browser localStorage',
        ]),
        correct_option_index: 1,
        explanation:
          'Payment providers retry webhooks at-least-once. Recording the event_id atomically with the order state transition guarantees idempotency.',
        sort_order: 2,
      },
      {
        id: 'qq_3',
        prompt: 'What must the backend verify before marking an order as paid upon receiving a valid webhook?',
        options: JSON.stringify([
          'Only that the user is currently online',
          'That the cryptographic signature is valid AND the transaction amount and currency match the persisted server-calculated order total',
          'Only that the reference starts with REF_',
          'That the frontend sent a toast notification',
        ]),
        correct_option_index: 1,
        explanation:
          'Verifying both the HMAC signature and the exact amount/currency against the persisted order prevents partial-amount tampering.',
        sort_order: 3,
      },
    ];

    for (const q of quizQuestions) {
      tx.prepare(
        `INSERT INTO quiz_questions (id, quiz_id, prompt, options, correct_option_index, explanation, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(q.id, quiz1Id, q.prompt, q.options, q.correct_option_index, q.explanation, q.sort_order);
    }

    const quiz2Id = 'qz_webrtc_01';
    tx.prepare(
      `INSERT INTO quizzes (id, course_id, lesson_id, title, description, passing_score, created_at)
       VALUES (?, 'crs_webrtc_livekit', 'les_webrtc_1_2', 'LiveKit Security & SFU Architecture Quiz', 'Test your mastery of SFU routing and server-side token permissions.', 70, ?)`
    ).run(quiz2Id, now);

    tx.prepare(
      `INSERT INTO quiz_questions (id, quiz_id, prompt, options, correct_option_index, explanation, sort_order)
       VALUES ('qq_w1', ?, 'Where must LiveKit access tokens with roomJoin or roomAdmin privileges be generated?', ?, 1, 'The LiveKit API Secret must never be exposed to client bundles; tokens are minted on the backend after verifying enrollment and user role.', 1)`
    ).run(
      quiz2Id,
      JSON.stringify([
        'Directly in the browser using environment variables',
        'On the backend server after authenticating the user and verifying course entitlement and role permissions',
        'Inside a static JSON file in the public folder',
        'By passing the API secret in a URL query string',
      ])
    );

    // Assignment
    tx.prepare(
      `INSERT INTO assignments (id, course_id, title, instructions, due_days, max_score, created_at)
       VALUES ('asg_fintech_01', 'crs_fintech_arch', 'Design an Idempotent Webhook & Reconciliation Schema', 'Submit your SQL transaction flow and pseudocode demonstrating how your service handles an out-of-order Mobile Money webhook and prevents double-crediting.', 7, 100, ?)`
    ).run(now);

    // Announcements & Notifications
    tx.prepare(
      `INSERT INTO announcements (id, course_id, author_id, title, body, audience, created_at)
       VALUES ('ann_01', 'crs_fintech_arch', ?, 'Live Architecture Clinic Today — Room Open', 'Our live session on Idempotent Mobile Money Callbacks & Ledger Locks is active in the LiveKit Classroom. Join with audio/video or follow the live screen share.', 'course', ?)`
    ).run(inst1Id, now);

    tx.prepare(
      `INSERT INTO announcements (id, course_id, author_id, title, body, audience, created_at)
       VALUES ('ann_02', NULL, ?, 'Welcome to Aether Academy — Ghana Mobile Money & Live Classrooms Enabled', 'All courses and digital library resources support instant enrollment, Paystack & Hubtel GHS checkout, and interactive LiveKit classrooms.', 'all', ?)`
    ).run(adminId, now);

    tx.prepare(
      `INSERT INTO notifications (id, user_id, title, message, link, is_read, created_at)
       VALUES (?, ?, 'Live Session in Progress', 'Dr. Kwame Asante has opened the Live Architecture Clinic classroom.', '/classroom/ses_live_01', 0, ?)`
    ).run(newId('ntf'), student1Id, now);
    });
  }

  // Always verify and upsert demo accounts & student enrollments
  withTransaction((tx) => {
    ensureDemoAccountsAndAccess(tx);
  });
}

function ensureDemoAccountsAndAccess(tx: any): void {
  const now = nowIso();
  const defaultPass = hashPassword('Password123!');

  const users = [
    {
      id: 'usr_admin_01',
      email: 'admin@aetheracademy.edu.gh',
      full_name: 'Nana Ama Mensah',
      role: 'admin',
      title: 'Director of Academic Operations',
      bio: 'Leads curriculum accreditation, financial governance, and digital learning operations across West Africa.',
    },
    {
      id: 'usr_inst_01',
      email: 'kwame.asante@aetheracademy.edu.gh',
      full_name: 'Dr. Kwame Asante',
      role: 'instructor',
      title: 'Principal Distributed Systems Architect',
      bio: 'Former Principal Engineer building high-throughput payment switches and cloud-native infrastructure across Africa and Europe.',
    },
    {
      id: 'usr_inst_02',
      email: 'efua.danquah@aetheracademy.edu.gh',
      full_name: 'Efua Danquah',
      role: 'instructor',
      title: 'Lead Design Systems & Product Strategist',
      bio: 'Award-winning interface architect specializing in spatial computing, glassmorphic design systems, and WCAG accessibility.',
    },
    {
      id: 'usr_stud_01',
      email: 'kofi.student@aetheracademy.edu.gh',
      full_name: 'Kofi Boateng',
      role: 'student',
      title: 'Full-Stack Software Engineer',
      bio: 'Building resilient financial and educational products in Accra.',
    },
    {
      id: 'usr_stud_02',
      email: 'akua.learner@aetheracademy.edu.gh',
      full_name: 'Akua Osei',
      role: 'student',
      title: 'Product Designer & Frontend Developer',
      bio: 'Focused on high-craft UI engineering and real-time collaboration tools.',
    },
    {
      id: 'usr_stud_demo',
      email: 'student@lms.local',
      full_name: 'Kofi Boateng',
      role: 'student',
      title: 'Full-Stack Software Engineer',
      bio: 'Building resilient financial and educational products.',
    },
    {
      id: 'usr_inst_demo',
      email: 'instructor@lms.local',
      full_name: 'Dr. Kwame Asante',
      role: 'instructor',
      title: 'Principal Distributed Systems Architect',
      bio: 'Leading real-time WebRTC and distributed systems engineering.',
    },
    {
      id: 'usr_admin_demo',
      email: 'admin@lms.local',
      full_name: 'Nana Ama Mensah',
      role: 'admin',
      title: 'Director of Academic Operations',
      bio: 'Platform administration and institutional governance.',
    },
  ];

  for (const u of users) {
    const existing = tx.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`).get(u.email);
    if (!existing) {
      tx.prepare(
        `INSERT INTO users (id, email, password_hash, full_name, role, title, bio, status, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`
      ).run(u.id, u.email, defaultPass, u.full_name, u.role, u.title, u.bio, now, now);
    } else {
      tx.prepare(
        `UPDATE users SET password_hash = ?, status = 'active' WHERE LOWER(email) = LOWER(?)`
      ).run(defaultPass, u.email);
    }
  }

  // Ensure student demo users have active enrollments to courses
  for (const studentId of ['usr_stud_01', 'usr_stud_demo']) {
    try {
      grantEntitlement({
        db: tx,
        userId: studentId,
        targetType: 'course',
        targetId: 'crs_webrtc_livekit',
        source: 'free_enrollment',
      });
    } catch {
      // already enrolled
    }
    try {
      grantEntitlement({
        db: tx,
        userId: studentId,
        targetType: 'course',
        targetId: 'crs_fintech_arch',
        source: 'purchase',
      });
    } catch {
      // already enrolled
    }
  }
}

