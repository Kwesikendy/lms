import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Layers,
  Lock,
  Package,
  Play,
  Radio,
  Search,
  ShieldCheck,
  Smartphone,
  Video,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { apiRequest, formatCurrency, formatDateTime, dateParts, timeRange } from '../../lib/api.js';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardGridSkeleton,
  Chip,
  Cover,
  Disclosure,
  EmptyState,
  ErrorState,
  InputField,
  LinkButton,
  Modal,
  Reveal,
  SectionHeading,
  SelectField,
  Skeleton,
  Tabs,
} from '../../components/ui/index.js';
import { ArrowLink, CourseCard, ResourceCard, SessionRow } from '../../components/ui/Cards.js';
import type {
  Course,
  CourseCategory,
  CourseModule,
  LearningResource,
  LiveSession,
  Product,
} from '../../../shared/types.js';

type CourseWithAccess = Course & { has_access?: boolean };

/* ============================================================================
   HOME
   ============================================================================ */
export const HomePage: React.FC = () => {
  const { settings, user } = useApp();
  const [courses, setCourses] = useState<CourseWithAccess[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [bundles, setBundles] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
      setSessions((s.sessions || []).filter((x) => x.status === 'live' || x.status === 'scheduled').slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the catalogue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const heroCourse = courses[0];
  const featuredSession = sessions.find((s) => s.status === 'live') ?? sessions[0];
  const bundle = bundles[0];

  return (
    <div>
      {/* HERO */}
      <section className="atmosphere px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:pb-28">
        <div className="mx-auto grid max-w-[1360px] items-center gap-14 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {featuredSession?.status === 'live' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <Link
                  to={`/classroom/${featuredSession.id}`}
                  className="glass mb-8 inline-flex max-w-full items-center gap-3 rounded-full py-1.5 pl-4 pr-2 text-sm transition-transform hover:-translate-y-0.5"
                >
                  <span className="live-dot shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    <span className="font-medium">Live now:</span> {featuredSession.title}
                  </span>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-on-ink">
                    <ArrowRight className="size-3.5" />
                  </span>
                </Link>
              </motion.div>
            )}
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="display text-[2.75rem] sm:text-6xl lg:text-[4.4rem] font-extrabold tracking-tight"
            >
              Skills you can use on Monday, taught live by people who do the work.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 max-w-xl text-lg text-ink-2 leading-relaxed"
            >
              {settings.org_tagline}. Join interactive live classes, learn at your own pace, and keep every guide and curriculum in one permanent library.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 flex flex-wrap items-center gap-3.5"
            >
              <LinkButton to="/courses" size="lg" variant="accent" iconRight={<ArrowRight className="size-4" />}>
                Browse courses
              </LinkButton>
              <LinkButton to={user ? '/student/dashboard' : '/auth?mode=signup'} variant="glass" size="lg">
                {user ? 'Go to my dashboard' : 'Create free account'}
              </LinkButton>
            </motion.div>
            <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3.5 text-sm font-medium text-ink-2">
              {[
                { icon: Radio, text: 'Live WebRTC classrooms' },
                { icon: Smartphone, text: 'Mobile Money & Card instant checkout' },
                { icon: ShieldCheck, text: 'Direct access & lifetime library' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-accent shrink-0">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto h-[26rem] w-full max-w-[28rem] lg:col-span-5"
          >
            {loading ? (
              <Skeleton className="h-full rounded-3xl" />
            ) : (
              <>
                {heroCourse && (
                  <Card interactive padding="none" className="absolute left-0 top-0 w-[80%] -rotate-[2.5deg] p-3 hover:rotate-0">
                    <Cover seed={heroCourse.slug} label={heroCourse.category_name} className="h-44" />
                    <div className="px-2 pb-2 pt-4">
                      <h2 className="display text-xl leading-snug">
                        <Link to={`/courses/${heroCourse.slug}`} className="after:absolute after:inset-0 after:rounded-3xl">
                          {heroCourse.title}
                        </Link>
                      </h2>
                      <div className="mt-3 flex items-center justify-between text-[13px] text-ink-3">
                        <span className="flex items-center gap-2">
                          <Avatar name={heroCourse.instructor_name ?? ''} size={24} />
                          {heroCourse.instructor_name}
                        </span>
                        <span className="font-semibold text-ink">{formatCurrency(heroCourse.price_ghs, heroCourse.currency)}</span>
                      </div>
                    </div>
                  </Card>
                )}
                {featuredSession && (
                  <div className="glass absolute bottom-0 right-0 w-[82%] rotate-[1.5deg] rounded-3xl p-5">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {featuredSession.status === 'live' ? (
                        <span className="inline-flex items-center gap-2 text-accent-ink">
                          <span className="live-dot" aria-hidden="true" /> Live now
                        </span>
                      ) : (
                        <span className="text-ink-3">
                          {dateParts(featuredSession.scheduled_start_at).weekday} · {timeRange(featuredSession.scheduled_start_at, featuredSession.scheduled_end_at)}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 font-medium leading-snug">{featuredSession.title}</p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="truncate text-[13px] text-ink-3">{featuredSession.instructor_name}</span>
                      <LinkButton to={`/classroom/${featuredSession.id}`} size="sm" variant={featuredSession.status === 'live' ? 'accent' : 'primary'}>
                        {featuredSession.status === 'live' ? 'Join' : 'Details'}
                      </LinkButton>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-[1360px] space-y-24 px-4 sm:px-6">
        {error && <ErrorState message={error} onRetry={load} />}

        {/* FEATURED COURSES */}
        <section aria-labelledby="featured-heading">
          <Reveal>
            <SectionHeading
              title="Featured courses"
              description="Structured paths with live sessions, assessments and a project at the end."
              action={<ArrowLink to="/courses">All courses</ArrowLink>}
            />
          </Reveal>
          {loading ? (
            <CardGridSkeleton count={3} />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {courses.slice(0, 3).map((c, i) => (
                <Reveal key={c.id} delay={i * 0.07}>
                  <CourseCard course={c} />
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/* LIVE */}
        {sessions.length > 0 && (
          <section aria-labelledby="live-heading">
            <Reveal>
              <SectionHeading title="Coming up live" description="Show up, ask questions, and get answers in real time." />
            </Reveal>
            <Reveal>
              <div className="grid gap-3 lg:grid-cols-2">
                {sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    action={
                      <LinkButton to={`/classroom/${s.id}`} size="sm" variant={s.status === 'live' ? 'accent' : 'secondary'}>
                        {s.status === 'live' ? 'Join' : 'View'}
                      </LinkButton>
                    }
                  />
                ))}
              </div>
            </Reveal>
          </section>
        )}

        {/* BUNDLE */}
        {bundle && (
          <Reveal>
            <Card tone="night" padding="none" className="grain overflow-hidden">
              <div className="relative grid gap-8 p-8 sm:p-12 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-8">
                  <Badge tone="accent" className="mb-5">
                    <Package className="size-3.5" aria-hidden="true" /> Bundle
                  </Badge>
                  <h2 className="display text-3xl sm:text-4xl">{bundle.title}</h2>
                  <p className="mt-4 max-w-2xl text-white/70">{bundle.description}</p>
                  <ul className="mt-6 flex flex-wrap gap-2">
                    {bundle.bundle_items?.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] text-white/90">
                        <Check className="size-3.5 text-[#ffb59c]" aria-hidden="true" /> {item.title}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lg:col-span-4 lg:text-right">
                  <p className="text-sm text-white/55">One payment</p>
                  <p className="display mt-1 text-5xl">{formatCurrency(bundle.price_ghs, bundle.currency)}</p>
                  <LinkButton to={`/checkout?productId=${bundle.id}`} variant="light" size="lg" className="mt-6">
                    Get the bundle
                  </LinkButton>
                </div>
              </div>
            </Card>
          </Reveal>
        )}

        {/* LIBRARY */}
        <section aria-labelledby="library-heading">
          <Reveal>
            <SectionHeading
              title="From the library"
              description="Books, runbooks and templates you can read, download and keep."
              action={<ArrowLink to="/resources">Browse library</ArrowLink>}
            />
          </Reveal>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {loading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-3xl" />)
              : resources.map((r, i) => (
                  <Reveal key={r.id} delay={i * 0.07}>
                    <ResourceCard
                      resource={r}
                      action={
                        <Link to="/resources" className="inline-flex items-center gap-1 text-sm font-medium after:absolute after:inset-0 after:rounded-3xl hover:text-accent-ink">
                          View <ChevronRight className="size-4" />
                        </Link>
                      }
                    />
                  </Reveal>
                ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section aria-labelledby="how-heading">
          <Reveal>
            <SectionHeading title="How it works" />
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { n: '01', icon: Search, title: 'Pick a course', text: 'Preview the curriculum and free lessons before you commit.' },
              { n: '02', icon: Video, title: 'Learn live or on your own', text: 'Join scheduled classes, then revisit lessons and notes any time.' },
              { n: '03', icon: GraduationCap, title: 'Prove it', text: 'Quizzes and assignments with feedback from your instructor.' },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 0.08}>
                <Card tone="tint" className="h-full">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-2xl bg-card text-ink shadow-sm">
                      <step.icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="display text-3xl text-ink/20">{step.n}</span>
                  </div>
                  <h3 className="display mt-6 text-2xl">{step.title}</h3>
                  <p className="mt-2 text-sm text-ink-3">{step.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        {!user && (
          <Reveal>
            <Card tone="tint" padding="lg" className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div>
                <h2 className="display text-3xl">Start with a free course.</h2>
                <p className="mt-2 text-ink-3">Create an account in a minute. No card needed.</p>
              </div>
              <LinkButton to="/auth?mode=signup" size="lg">
                Create account
              </LinkButton>
            </Card>
          </Reveal>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
   COURSE CATALOGUE
   ============================================================================ */
export const CourseCatalogPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState<CourseWithAccess[]>([]);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || 'all';
  const price = (searchParams.get('price') || 'all') as 'all' | 'free' | 'paid';
  const sort = searchParams.get('sort') || 'featured';
  const [search, setSearch] = useState(q);

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!value || value === 'all' || (key === 'sort' && value === 'featured')) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(() => {
    if (search === q) return;
    const t = window.setTimeout(() => setParam('q', search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search, q, setParam]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ q, category, price, sort });
      const [c, cat] = await Promise.all([
        apiRequest<{ courses: CourseWithAccess[] }>(`/api/catalog/courses?${qs.toString()}`),
        apiRequest<{ categories: CourseCategory[] }>('/api/catalog/categories'),
      ]);
      setCourses(c.courses || []);
      setCategories(cat.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses.');
    } finally {
      setLoading(false);
    }
  }, [q, category, price, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const filtersActive = q || category !== 'all' || price !== 'all';

  return (
    <div className="mx-auto max-w-[1360px] px-4 pb-8 pt-12 sm:px-6">
      <Reveal y={10}>
        <h1 className="display text-5xl sm:text-6xl">Courses</h1>
        <p className="mt-4 max-w-xl text-ink-3">Learn from practitioners. Every course has structured modules, assessments and live sessions.</p>
      </Reveal>

      <div className="mt-10 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <InputField
            wrapperClassName="lg:w-96"
            type="search"
            aria-label="Search courses"
            placeholder="Search by topic, title or instructor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leading={<Search className="size-4" />}
          />
          <div className="flex flex-1 flex-wrap items-center gap-3 lg:justify-end">
            <Tabs
              id="price"
              label="Price"
              value={price}
              onChange={(v) => setParam('price', v)}
              items={[
                { id: 'all', label: 'All' },
                { id: 'free', label: 'Free' },
                { id: 'paid', label: 'Paid' },
              ]}
            />
            <SelectField
              aria-label="Sort courses"
              wrapperClassName="w-48"
              value={sort}
              onChange={(e) => setParam('sort', e.target.value)}
              options={[
                { value: 'featured', label: 'Featured' },
                { value: 'newest', label: 'Newest' },
                { value: 'price_asc', label: 'Price: low to high' },
                { value: 'price_desc', label: 'Price: high to low' },
              ]}
            />
          </div>
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Categories">
          <Chip active={category === 'all'} onClick={() => setParam('category', 'all')}>
            All topics
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setParam('category', c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <p className="mt-8 text-sm text-ink-3" aria-live="polite">
        {loading ? 'Loading…' : `${courses.length} ${courses.length === 1 ? 'course' : 'courses'}`}
      </p>

      <div className="mt-4">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <CardGridSkeleton count={6} />
        ) : courses.length === 0 ? (
          <EmptyState
            title="No courses match"
            description="Try a different search or clear your filters."
            action={
              filtersActive ? (
                <Button variant="secondary" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
              >
                <CourseCard course={c} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
   COURSE DETAIL
   ============================================================================ */
export const CourseDetailPage: React.FC = () => {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const { user, notify, refreshAuth } = useApp();
  const navigate = useNavigate();

  const [course, setCourse] = useState<(CourseWithAccess & { product_id?: string }) | null>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slugOrId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{
        course: CourseWithAccess & { product_id?: string };
        modules: CourseModule[];
        liveSessions: LiveSession[];
        relatedResources: LearningResource[];
      }>(`/api/catalog/courses/${slugOrId}`);
      setCourse(data.course);
      setModules(data.modules || []);
      setSessions(data.liveSessions || []);
      setResources(data.relatedResources || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this course.');
    } finally {
      setLoading(false);
    }
  }, [slugOrId]);

  useEffect(() => {
    load();
  }, [load]);

  const lessonCount = useMemo(() => modules.reduce((n, m) => n + m.lessons.length, 0), [modules]);

  const enrollFree = async () => {
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/courses/${slugOrId}`)}`);
      return;
    }
    if (!course) return;
    setEnrolling(true);
    try {
      await apiRequest('/api/learning/enroll-free', { method: 'POST', body: JSON.stringify({ courseId: course.id }) });
      await refreshAuth();
      notify({ type: 'success', title: "You're enrolled", message: course.title });
      navigate(`/student/workspace/${course.id}`);
    } catch (err) {
      notify({ type: 'error', title: 'Could not enrol', message: err instanceof Error ? err.message : undefined });
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto grid max-w-[1360px] gap-10 px-4 pt-12 sm:px-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
        <Skeleton className="h-96 rounded-3xl lg:col-span-4" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-16">
        <ErrorState message={error || 'Course not found.'} onRetry={load} />
      </div>
    );
  }

  const checkoutTarget = `/checkout?productId=${course.product_id || `prd_${course.id}`}`;

  return (
    <div className="mx-auto max-w-[1360px] px-4 pb-8 pt-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-sm text-ink-3">
        <Link to="/courses" className="hover:text-ink">Courses</Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span className="truncate text-ink-2">{course.category_name || 'Course'}</span>
      </nav>

      <div className="grid items-start gap-12 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-8">
          <header>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Badge tone="sage">{course.category_name || 'Curriculum'}</Badge>
              <Badge>{course.level}</Badge>
            </div>
            <h1 className="display text-4xl sm:text-5xl lg:text-6xl">{course.title}</h1>
            {course.subtitle && <p className="mt-5 max-w-2xl text-lg text-ink-2">{course.subtitle}</p>}
            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-ink-2">
              <span className="flex items-center gap-2.5">
                <Avatar name={course.instructor_name ?? ''} size={32} />
                <span>
                  <span className="block text-xs text-ink-3">Taught by</span>
                  <span className="font-medium">{course.instructor_name}</span>
                </span>
              </span>
              <span className="flex items-center gap-2"><Clock className="size-4 text-ink-3" aria-hidden="true" /> {course.duration_hours} hours</span>
              <span className="flex items-center gap-2"><Layers className="size-4 text-ink-3" aria-hidden="true" /> {lessonCount} lessons</span>
            </div>
          </header>

          <section aria-labelledby="overview-h">
            <h2 id="overview-h" className="display mb-4 text-3xl">About this course</h2>
            <p className="max-w-[68ch] text-[17px] leading-relaxed text-ink-2">{course.description}</p>
          </section>

          {course.learning_outcomes.length > 0 && (
            <Card tone="tint" padding="lg">
              <h2 className="display mb-6 text-3xl">What you'll learn</h2>
              <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {course.learning_outcomes.map((o, i) => (
                  <li key={i} className="flex gap-3 text-[15px] text-ink-2">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                      <Check className="size-3.5" aria-hidden="true" />
                    </span>
                    {o}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <section aria-labelledby="curriculum-h">
            <div className="mb-5 flex items-end justify-between">
              <h2 id="curriculum-h" className="display text-3xl">Curriculum</h2>
              <span className="text-sm text-ink-3">{modules.length} modules · {lessonCount} lessons</span>
            </div>
            <div className="space-y-3">
              {modules.map((mod, i) => (
                <Disclosure
                  key={mod.id}
                  defaultOpen={i === 0}
                  title={mod.title}
                  meta={`${mod.lessons.length} lessons`}
                >
                  <ul className="divide-y divide-line">
                    {mod.lessons.map((les) => {
                      const canOpen = course.has_access || les.is_preview;
                      return (
                        <li key={les.id} className="flex items-center gap-4 px-5 py-3.5">
                          <span className={`grid size-8 shrink-0 place-items-center rounded-full ${canOpen ? 'bg-accent-soft text-accent-ink' : 'bg-ink/6 text-ink-3'}`}>
                            {canOpen ? <Play className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{les.title}</p>
                            {les.description && <p className="truncate text-[13px] text-ink-3">{les.description}</p>}
                          </div>
                          {les.is_preview && !course.has_access && <Badge tone="sky">Preview</Badge>}
                          <span className="w-10 text-right text-xs tabular-nums text-ink-3">{les.duration_minutes}m</span>
                          {canOpen && (
                            <Link
                              to={`/student/workspace/${course.id}?lessonId=${les.id}`}
                              className="text-sm font-medium text-accent-ink hover:underline"
                            >
                              Open
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Disclosure>
              ))}
            </div>
          </section>

          {course.requirements.length > 0 && (
            <section aria-labelledby="req-h">
              <h2 id="req-h" className="display mb-4 text-3xl">Before you start</h2>
              <ul className="space-y-2 text-[15px] text-ink-2">
                {course.requirements.map((r, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    {r}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="instr-h">
            <h2 id="instr-h" className="display mb-5 text-3xl">Your instructor</h2>
            <Card className="flex gap-5">
              <Avatar name={course.instructor_name ?? ''} size={64} />
              <div>
                <p className="text-lg font-semibold">{course.instructor_name}</p>
                {course.instructor_title && <p className="text-sm text-accent-ink">{course.instructor_title}</p>}
                {course.instructor_bio && <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-2">{course.instructor_bio}</p>}
              </div>
            </Card>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-28 lg:col-span-4">
          <Card padding="none" className="overflow-hidden p-3">
            <Cover seed={course.slug} className="h-48" />
            <div className="space-y-5 p-4">
              <p className="display text-5xl">{course.is_free ? 'Free' : formatCurrency(course.price_ghs, course.currency)}</p>

              {course.has_access ? (
                <>
                  <div className="flex items-center gap-2.5 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">
                    <ShieldCheck className="size-[18px] shrink-0" aria-hidden="true" /> You have access to this course
                  </div>
                  <LinkButton to={`/student/workspace/${course.id}`} size="lg" className="w-full">
                    Continue learning
                  </LinkButton>
                </>
              ) : course.is_free ? (
                <Button size="lg" className="w-full" loading={enrolling} onClick={enrollFree}>
                  Enrol for free
                </Button>
              ) : (
                <>
                  <LinkButton
                    to={user ? checkoutTarget : `/auth?redirect=${encodeURIComponent(checkoutTarget)}`}
                    variant="accent"
                    size="lg"
                    className="w-full"
                  >
                    Enrol now
                  </LinkButton>
                  <p className="text-center text-xs text-ink-3">Mobile Money or card. Access unlocks once payment is confirmed.</p>
                </>
              )}

              <ul className="space-y-3 border-t border-line pt-5 text-sm text-ink-2">
                <li className="flex items-center gap-3"><Layers className="size-4 text-ink-3" aria-hidden="true" /> {lessonCount} lessons across {modules.length} modules</li>
                <li className="flex items-center gap-3"><Clock className="size-4 text-ink-3" aria-hidden="true" /> {course.duration_hours} hours of content</li>
                <li className="flex items-center gap-3"><Radio className="size-4 text-ink-3" aria-hidden="true" /> {sessions.length} upcoming live {sessions.length === 1 ? 'session' : 'sessions'}</li>
                <li className="flex items-center gap-3"><FileText className="size-4 text-ink-3" aria-hidden="true" /> {resources.length} downloadable {resources.length === 1 ? 'resource' : 'resources'}</li>
              </ul>
            </div>
          </Card>

          {sessions.length > 0 && (
            <Card padding="sm" className="p-4">
              <h3 className="px-1 pb-3 text-sm font-semibold">Upcoming live sessions</h3>
              <div className="space-y-2">
                {sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    compact
                    session={s}
                    action={
                      <LinkButton to={`/classroom/${s.id}`} size="sm" variant="secondary">
                        {s.status === 'live' ? 'Join' : 'Open'}
                      </LinkButton>
                    }
                  />
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
};

/* ============================================================================
   RESOURCE LIBRARY
   ============================================================================ */
export const ResourceCatalogPage: React.FC = () => {
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('all');
  const [price, setPrice] = useState<'all' | 'free' | 'paid'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ resource: LearningResource; view: string; download: string | null } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ q: debounced, type, price });
      const res = await apiRequest<{ resources: LearningResource[] }>(`/api/catalog/resources?${qs.toString()}`);
      setResources(res.resources || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the library.');
    } finally {
      setLoading(false);
    }
  }, [debounced, type, price]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (r: LearningResource) => {
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent('/resources')}`);
      return;
    }
    try {
      const data = await apiRequest<{ resource: LearningResource; signedViewUrl: string; signedDownloadUrl: string | null }>(
        `/api/learning/resources/${r.id}/access`
      );
      setOpened({ resource: data.resource, view: data.signedViewUrl, download: data.signedDownloadUrl });
    } catch (err) {
      notify({ type: 'error', title: 'Access needed', message: err instanceof Error ? err.message : undefined });
    }
  };

  const types = [
    { id: 'all', label: 'All' },
    { id: 'book', label: 'Books' },
    { id: 'pdf', label: 'Guides' },
    { id: 'video', label: 'Video' },
    { id: 'template', label: 'Templates' },
  ];

  return (
    <div className="mx-auto max-w-[1360px] px-4 pb-8 pt-12 sm:px-6">
      <Reveal y={10}>
        <h1 className="display text-5xl sm:text-6xl">Library</h1>
        <p className="mt-4 max-w-xl text-ink-3">Books, runbooks and templates. Buy once, keep forever.</p>
      </Reveal>

      <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <InputField
          wrapperClassName="lg:w-96"
          type="search"
          aria-label="Search the library"
          placeholder="Search the library"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leading={<Search className="size-4" />}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Tabs id="res-type" label="Format" value={type} onChange={setType} items={types} />
          <Tabs
            id="res-price"
            label="Price"
            value={price}
            onChange={setPrice}
            items={[
              { id: 'all', label: 'All' },
              { id: 'free', label: 'Free' },
              { id: 'paid', label: 'Paid' },
            ]}
          />
        </div>
      </div>

      <div className="mt-10">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <CardGridSkeleton count={3} />
        ) : resources.length === 0 ? (
          <EmptyState title="Nothing here yet" description="Try a different search or format." />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
              >
                <ResourceCard
                  resource={r}
                  action={
                    r.has_access ? (
                      <Button size="sm" variant="secondary" onClick={() => open(r)} icon={<BookOpen className="size-4" />}>
                        Open
                      </Button>
                    ) : (
                      <LinkButton
                        size="sm"
                        to={
                          user
                            ? `/checkout?productId=${r.product_id || `prd_${r.id}`}`
                            : `/auth?redirect=${encodeURIComponent(`/checkout?productId=${r.product_id || `prd_${r.id}`}`)}`
                        }
                      >
                        Buy
                      </LinkButton>
                    )
                  }
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(opened)}
        onClose={() => setOpened(null)}
        title={opened?.resource.title ?? ''}
        description="Links are private and expire after 15 minutes."
        footer={
          opened && (
            <>
              <LinkButton href={opened.view} target="_blank" variant="secondary" icon={<ExternalLink className="size-4" />}>
                Open in new tab
              </LinkButton>
              {opened.download && (
                <LinkButton href={opened.download} download icon={<Download className="size-4" />}>
                  Download
                </LinkButton>
              )}
            </>
          )
        }
      >
        {opened && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-2">{opened.resource.description}</p>
            <p className="text-xs text-ink-3">{opened.resource.file_name}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};
