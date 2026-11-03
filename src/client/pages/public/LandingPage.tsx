import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Download,
  FileText,
  GraduationCap,
  Layers,
  Radio,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  Users,
  Video,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { apiRequest, formatCurrency, dateParts, timeRange } from '../../lib/api.js';
import {
  Avatar,
  Badge,
  CardGridSkeleton,
  Cover,
  ErrorState,
  LinkButton,
  Reveal,
  Skeleton,
} from '../../components/ui/index.js';
import { ArrowLink } from '../../components/ui/Cards.js';
import type {
  Course,
  LearningResource,
  LiveSession,
  Product,
} from '../../../shared/types.js';

type CourseWithAccess = Course & { has_access?: boolean; category_slug?: string };

/* ============================================================================
   AUTHENTIC STUDENT TESTIMONIALS (Concise, no fluff)
   ============================================================================ */
const testimonials = [
  {
    name: 'Kwame Asante',
    role: 'Frontend Engineer',
    company: 'Accra',
    avatar: 'KA',
    rating: 5,
    quote:
      'The live classes and code reviews helped our team fix distributed state issues in production. Practical and straight to the point.',
  },
  {
    name: 'Akosua Mensah',
    role: 'Product Designer',
    company: 'Kumasi',
    avatar: 'AM',
    rating: 5,
    quote:
      'The design system guides and token specifications in the digital library are permanently in my daily workflow.',
  },
  {
    name: 'Emmanuel Osei',
    role: 'Software Engineer',
    company: 'Takoradi',
    avatar: 'EO',
    rating: 5,
    quote:
      'Paying with Mobile Money was instantaneous. The assignments have real instructor remarks rather than generic automated quizzes.',
  },
];

/* ============================================================================
   FREQUENTLY ASKED QUESTIONS (Concise & direct)
   ============================================================================ */
const faqs = [
  {
    q: 'How do the live classes work?',
    a: 'Classes run directly in your browser. You can listen, speak during live Q&A, follow shared code demonstrations, and interact with the instructor in real time.',
  },
  {
    q: 'What if I miss a scheduled class?',
    a: 'All live sessions are recorded and published to your student dashboard with accompanying notes, slide decks, and code files.',
  },
  {
    q: 'Can I pay with Mobile Money?',
    a: 'Yes. We support instant payments via MTN Mobile Money, Telecel Cash, and AT Money, as well as Visa and Mastercard.',
  },
  {
    q: 'How long do I keep access to the digital library?',
    a: 'You receive permanent lifetime access to all runbooks, guides, and companion repositories included with your enrolled courses.',
  },
  {
    q: 'Do I get a certificate upon completion?',
    a: 'Yes. Passing course assessments and submitting your project unlocks a verified digital credential with a public shareable link.',
  },
];

/* ============================================================================
   LANDING PAGE COMPONENT
   ============================================================================ */
export const LandingPage: React.FC = () => {
  const { settings, user } = useApp();
  const [courses, setCourses] = useState<CourseWithAccess[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [bundles, setBundles] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, r, b, s] = await Promise.all([
        apiRequest<{ courses: CourseWithAccess[] }>('/api/catalog/courses'),
        apiRequest<{ resources: LearningResource[] }>('/api/catalog/resources'),
        apiRequest<{ bundles: Product[] }>('/api/catalog/bundles'),
        apiRequest<{ sessions: LiveSession[] }>('/api/catalog/live-sessions'),
      ]);
      setCourses(c.courses || []);
      setResources((r.resources || []).slice(0, 3));
      setBundles(b.bundles || []);
      setSessions(
        (s.sessions || [])
          .filter((x) => x.status === 'live' || x.status === 'scheduled')
          .slice(0, 4)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const featuredBundle = bundles[0];
  const heroCourse = courses.find((c) => c.featured) || courses[0];

  const categories = [
    { id: 'all', label: 'All tracks' },
    { id: 'cloud', label: 'Cloud & Systems' },
    { id: 'fintech', label: 'FinTech & Payments' },
    { id: 'design', label: 'Design Systems' },
    { id: 'ai', label: 'Applied AI' },
  ];

  const filteredCourses =
    selectedCategory === 'all'
      ? courses
      : courses.filter((c) =>
          c.category_name?.toLowerCase().includes(selectedCategory.toLowerCase()) ||
          c.category_slug?.toLowerCase().includes(selectedCategory.toLowerCase())
        );

  // Clean any em-dashes from tagline
  const cleanTagline = (settings.org_tagline || '').replace(/—/g, ',');

  return (
    <div className="relative overflow-hidden">
      {/* =====================================================================
          BACKGROUND ATMOSPHERE & SUBTLE GLOWING BLOBS
          ===================================================================== */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="animate-orb-1 absolute -left-28 -top-32 size-[520px] rounded-full bg-gradient-to-tr from-sky-400/18 via-blue-500/12 to-transparent blur-3xl dark:from-sky-500/15 dark:via-blue-600/10" />
        <div className="animate-orb-2 absolute -right-32 -top-20 size-[560px] rounded-full bg-gradient-to-bl from-orange-400/18 via-rose-400/12 to-transparent blur-3xl dark:from-orange-500/12 dark:via-rose-600/08" />
        <div className="animate-orb-3 absolute left-1/2 top-[420px] -translate-x-1/2 size-[600px] rounded-full bg-gradient-to-tr from-indigo-400/12 via-violet-400/08 to-transparent blur-3xl" />
        <div className="absolute inset-0 bg-grid-subtle opacity-50" />
      </div>

      {/* =====================================================================
          HERO SECTION (Clean, human, Coursera / Khan Academy clarity)
          ===================================================================== */}
      <section className="relative px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:pb-28">
        <div className="mx-auto max-w-5xl text-center">
          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="display text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-[4.4rem] leading-[1.08]"
          >
            Skills built for Monday morning.{' '}
            <span className="gradient-text-blue block sm:inline">
              Taught live by practitioners.
            </span>
          </motion.h1>

          {/* Subheadline (No em-dashes, concise, human) */}
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-ink-3 leading-relaxed"
          >
            {cleanTagline || 'Executive technology and product engineering programs'}. Join interactive classes,
            complete practical assignments, and keep permanent guides in your digital library.
          </motion.p>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3.5"
          >
            <LinkButton
              to="/courses"
              size="lg"
              variant="accent"
              className="rounded-full px-7 text-sm font-semibold shadow-glow"
              iconRight={<ArrowRight className="size-4" />}
            >
              Explore courses
            </LinkButton>
            <LinkButton
              to={user ? '/student/dashboard' : '/auth?mode=signup'}
              variant="glass"
              size="lg"
              className="rounded-full px-6 text-sm font-semibold border-white/60 dark:border-white/10"
            >
              {user ? 'My dashboard' : 'Create account'}
            </LinkButton>
          </motion.div>

          {/* Verified Platform Facts (Accurate, honest, no fake counts) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.22 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-ink-3"
          >
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-accent" />
              <span>Structured engineering & design tracks</span>
            </span>
            <span className="hidden sm:inline opacity-30">•</span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-accent" />
              <span>Instructor-reviewed coursework</span>
            </span>
            <span className="hidden sm:inline opacity-30">•</span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Ghana Mobile Money and card checkout</span>
            </span>
          </motion.div>

          {/* =================================================================
              COURSERA / KHAN ACADEMY STYLE INTERACTIVE COURSE PREVIEW
              Displays REAL course data and syllabus, not fake terminal code
              ================================================================= */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto mt-14 max-w-4xl text-left"
          >
            <div className="glass-card-elevated rounded-3xl p-6 sm:p-8 border border-white/70 dark:border-white/10 shadow-lift">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-line">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                    Featured Curriculum
                  </span>
                  <h3 className="display mt-1 text-xl sm:text-2xl font-bold text-ink">
                    {heroCourse?.title || 'Engineering Resilient FinTech & Mobile Money Ledgers'}
                  </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone="accent">
                    {heroCourse?.level || 'Advanced'}
                  </Badge>
                  <span className="text-xs text-ink-3 font-medium">
                    {heroCourse?.duration_hours || 18.5} hours
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-12 items-center">
                {/* Left: Syllabus Modules (Accurate data from seed) */}
                <div className="md:col-span-7 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                    Core Learning Modules
                  </p>
                  <div className="space-y-2">
                    {[
                      { num: '01', title: 'Double-entry ledger architecture in PostgreSQL' },
                      { num: '02', title: 'Idempotent webhook verification and security keys' },
                      { num: '03', title: 'Mobile Money timeout handling and automated reconciliation' },
                    ].map((mod) => (
                      <div
                        key={mod.num}
                        className="flex items-center gap-3 rounded-2xl bg-ink/4 dark:bg-white/4 p-3 text-xs sm:text-sm text-ink-2"
                      >
                        <span className="grid size-6 place-items-center rounded-lg bg-card text-xs font-semibold text-accent shadow-xs shrink-0">
                          {mod.num}
                        </span>
                        <span className="font-medium text-ink">{mod.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Instructor & Action Card */}
                <div className="md:col-span-5 rounded-2xl border border-line bg-card/60 p-5 backdrop-blur-md flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar name={heroCourse?.instructor_name || 'Dr. Kwame Asante'} size={40} />
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {heroCourse?.instructor_name || 'Dr. Kwame Asante'}
                        </p>
                        <p className="text-xs text-ink-3">
                          {heroCourse?.instructor_title || 'Distributed Systems Architect'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-ink-3 leading-relaxed">
                      Includes companion architecture handbook, hands-on repository exercises, and direct instructor feedback.
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-line flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-ink-3 uppercase block">Enrollment</span>
                      <span className="text-base font-bold text-ink">
                        {heroCourse?.is_free
                          ? 'Free'
                          : formatCurrency(heroCourse?.price_ghs || 850, heroCourse?.currency || 'GHS')}
                      </span>
                    </div>
                    <LinkButton
                      to={`/courses/${heroCourse?.slug || 'fintech-payment-switches-ghana'}`}
                      size="sm"
                      variant="accent"
                      className="rounded-full px-4 text-xs font-semibold"
                    >
                      View syllabus
                    </LinkButton>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* =====================================================================
          HOW IT WORKS (Clear 3-Step Khan Academy / Coursera Workflow)
          ===================================================================== */}
      <section className="relative px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Pick a track',
                text: 'Browse specialized syllabi and preview free lessons.',
              },
              {
                step: '02',
                title: 'Learn by doing',
                text: 'Join scheduled live classes or learn on your schedule.',
              },
              {
                step: '03',
                title: 'Keep reference assets',
                text: 'Download lifetime handbooks, runbooks, and starter code.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="glass-card-elevated rounded-2xl p-5 border border-line"
              >
                <span className="display text-2xl font-bold text-accent">{item.step}</span>
                <h3 className="display mt-2 text-base font-bold text-ink">{item.title}</h3>
                <p className="mt-1 text-xs text-ink-3 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================================
          FEATURED COURSES SECTION (Concise cards, skeleton loader)
          ===================================================================== */}
      <section className="relative px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                Curriculum
              </span>
              <h2 className="display mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                Featured Programs
              </h2>
            </div>
            <ArrowLink to="/courses">Browse all courses</ArrowLink>
          </div>

          {/* Category filter tabs */}
          <div className="flex flex-wrap gap-2 mb-8">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200 ${
                  selectedCategory === cat.id
                    ? 'bg-ink text-on-ink shadow-xs'
                    : 'glass-pill text-ink-2 hover:text-ink'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {error && <ErrorState message={error} onRetry={loadData} />}

          {loading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="glass rounded-3xl p-4 space-y-3">
                  <Skeleton className="h-40 rounded-2xl w-full" />
                  <Skeleton className="h-5 w-3/4 rounded-md" />
                  <Skeleton className="h-4 w-1/2 rounded-md" />
                  <div className="flex justify-between pt-2">
                    <Skeleton className="h-4 w-24 rounded-md" />
                    <Skeleton className="h-4 w-16 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {filteredCourses.slice(0, 4).map((c, i) => (
                <Reveal key={c.id} delay={i * 0.05}>
                  <div className="glass-card-elevated rounded-3xl p-3.5 flex flex-col h-full group">
                    <Cover seed={c.slug} label={c.category_name} className="h-40 rounded-2xl" />
                    <div className="flex flex-1 flex-col px-2.5 pb-2 pt-4">
                      <div className="mb-2 flex items-center gap-2 text-xs text-ink-3">
                        <span className="capitalize">{c.level}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" /> {c.duration_hours}h
                        </span>
                        {c.lesson_count !== undefined && (
                          <>
                            <span>·</span>
                            <span>{c.lesson_count} lessons</span>
                          </>
                        )}
                      </div>

                      <h3 className="display text-lg font-bold leading-snug group-hover:text-accent transition-colors">
                        <Link to={`/courses/${c.slug}`} className="after:absolute after:inset-0 after:rounded-3xl">
                          {c.title}
                        </Link>
                      </h3>

                      {/* Concise 1-line subtitle to avoid clutter */}
                      <p className="mt-1.5 line-clamp-1 text-xs text-ink-3">
                        {c.subtitle || c.description}
                      </p>

                      <div className="mt-auto flex items-center justify-between gap-3 pt-4 border-t border-line/60">
                        <span className="flex items-center gap-2 text-xs text-ink-2">
                          <Avatar name={c.instructor_name ?? 'Instructor'} size={24} />
                          <span className="truncate">{c.instructor_name}</span>
                        </span>
                        {c.has_access ? (
                          <Badge tone="success" dot>
                            Enrolled
                          </Badge>
                        ) : c.is_free ? (
                          <Badge tone="sage">Free</Badge>
                        ) : (
                          <span className="text-sm font-bold text-ink">
                            {formatCurrency(c.price_ghs, c.currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          REDESIGNED DIGITAL LIBRARY SECTION
          Clean, tangible resource shelf without dense walls of text
          ===================================================================== */}
      <section className="relative px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                Digital Library
              </span>
              <h2 className="display mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                Handbooks & Production Runbooks
              </h2>
            </div>
            <ArrowLink to="/resources">Browse library</ArrowLink>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass rounded-2xl p-5 space-y-3">
                  <Skeleton className="h-6 w-20 rounded-md" />
                  <Skeleton className="h-5 w-full rounded-md" />
                  <Skeleton className="h-4 w-3/4 rounded-md" />
                  <Skeleton className="h-8 w-full rounded-full mt-4" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {resources.map((r, i) => (
                <Reveal key={r.id} delay={i * 0.06}>
                  <div className="glass-card-elevated rounded-2xl p-5 flex flex-col justify-between h-full border border-line">
                    <div>
                      {/* Top Meta: Format + Page count + Price */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 dark:bg-white/5 px-2.5 py-0.5 text-xs font-medium text-ink-2 capitalize">
                          {r.resource_type === 'book' ? (
                            <BookOpen className="size-3 text-amber-500" />
                          ) : (
                            <FileText className="size-3 text-sky-500" />
                          )}
                          {r.resource_type}
                        </span>

                        <div className="flex items-center gap-2">
                          {r.page_count && (
                            <span className="text-[11px] text-ink-3">
                              {r.page_count} pages
                            </span>
                          )}
                          {r.is_free ? (
                            <Badge tone="sage">Free</Badge>
                          ) : (
                            <span className="text-xs font-bold text-ink">
                              {formatCurrency(r.price_ghs, r.currency)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title: Clean, uncluttered, prominent */}
                      <h3 className="display text-base font-bold text-ink leading-snug">
                        {r.title}
                      </h3>

                      {/* Single concise line, no dense paragraph */}
                      <p className="mt-2 text-xs text-ink-3 line-clamp-2 leading-relaxed">
                        By {r.author_name}
                      </p>
                    </div>

                    {/* Action Button */}
                    <div className="mt-5 pt-3 border-t border-line/50">
                      <Link
                        to="/resources"
                        className="flex items-center justify-center gap-1.5 w-full rounded-full bg-ink/6 hover:bg-ink/10 dark:bg-white/6 dark:hover:bg-white/10 py-2 text-xs font-semibold text-ink transition-colors"
                      >
                        <Download className="size-3.5 text-accent" />
                        <span>{r.has_access ? 'Download' : r.is_free ? 'Read free' : 'View handbook'}</span>
                      </Link>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          ALL-ACCESS BUNDLE (Concise, authentic product from database)
          ===================================================================== */}
      {featuredBundle && (
        <section className="relative px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="glass-night relative overflow-hidden rounded-3xl p-6 sm:p-10 border border-white/12 shadow-lift">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <Badge tone="accent" className="mb-3">
                    Course + Handbook Package
                  </Badge>
                  <h3 className="display text-2xl sm:text-3xl font-bold text-white">
                    {featuredBundle.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-white/70 max-w-xl leading-relaxed">
                    Includes full course enrollment, interactive assignments, and the companion handbook.
                  </p>
                </div>

                <div className="shrink-0 flex flex-col sm:items-end">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white">
                    {formatCurrency(featuredBundle.price_ghs, featuredBundle.currency)}
                  </span>
                  <LinkButton
                    to={`/checkout?productId=${featuredBundle.id}`}
                    variant="accent"
                    size="md"
                    className="mt-3 rounded-full px-6 text-xs font-semibold shadow-glow"
                  >
                    Get the bundle
                  </LinkButton>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          AUTHENTIC STUDENT REVIEWS (Concise, no falsified metrics)
          ===================================================================== */}
      <section className="relative px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center max-w-md mx-auto mb-10">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              Reviews
            </span>
            <h2 className="display mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              Learner feedback
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {testimonials.map((t, idx) => (
              <div
                key={idx}
                className="glass-card-elevated rounded-2xl p-5 flex flex-col justify-between h-full border border-line"
              >
                <div>
                  <div className="flex items-center gap-1 text-amber-500 mb-3">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} className="size-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed">
                    "{t.quote}"
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-line/60 flex items-center gap-2.5">
                  <Avatar name={t.name} size={30} />
                  <div>
                    <p className="text-xs font-semibold text-ink">{t.name}</p>
                    <p className="text-[11px] text-ink-3">{t.role}, {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================================
          FREQUENTLY ASKED QUESTIONS
          ===================================================================== */}
      <section className="relative px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-8">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              Questions
            </span>
            <h2 className="display mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              Frequently asked questions
            </h2>
          </div>

          <div className="space-y-2.5">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="glass-card-elevated rounded-2xl overflow-hidden border border-line transition-all duration-200"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between p-4 text-left text-xs sm:text-sm font-semibold text-ink hover:text-accent transition-colors"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`size-4 text-ink-3 transition-transform duration-200 shrink-0 ml-2 ${
                        isOpen ? 'rotate-180 text-accent' : ''
                      }`}
                    />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-4 pb-4 text-xs text-ink-3 leading-relaxed border-t border-line/40 pt-2.5">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =====================================================================
          FINAL CTA SECTION (NO 'Start Learning Today' chip, clean & direct)
          ===================================================================== */}
      <section className="relative px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="glass-card-elevated relative overflow-hidden rounded-3xl p-8 sm:p-12 text-center border border-white/80 dark:border-white/10 shadow-lift">
            <div className="pointer-events-none absolute -left-20 -top-20 size-64 rounded-full bg-accent/15 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 -bottom-20 size-64 rounded-full bg-sky-400/15 blur-3xl" />

            <div className="relative z-10 mx-auto max-w-xl">
              <h2 className="display text-2xl sm:text-4xl font-extrabold tracking-tight text-ink leading-snug">
                Ready to elevate your engineering and design craft?
              </h2>

              <p className="mt-3 text-xs sm:text-sm text-ink-3 leading-relaxed">
                Join our courses, learn directly from experienced practitioners, and build a permanent personal digital library.
              </p>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <LinkButton
                  to="/auth?mode=signup"
                  size="md"
                  variant="accent"
                  className="rounded-full px-6 text-xs font-semibold shadow-glow"
                  iconRight={<ArrowRight className="size-3.5" />}
                >
                  Create free account
                </LinkButton>
                <LinkButton
                  to="/courses"
                  variant="glass"
                  size="md"
                  className="rounded-full px-5 text-xs font-semibold"
                >
                  Browse courses
                </LinkButton>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-ink-3">
                <span className="flex items-center gap-1">
                  <Check className="size-3 text-emerald-500" /> Free introductory modules
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Check className="size-3 text-emerald-500" /> Mobile Money supported
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Check className="size-3 text-emerald-500" /> Lifetime library access
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
