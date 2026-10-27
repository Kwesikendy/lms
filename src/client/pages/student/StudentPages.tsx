import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Lock,
  Play,
  Radio,
  Receipt,
  RotateCcw,
  Search,
  Send,
  Trophy,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import {
  apiRequest,
  firstName,
  formatCurrency,
  formatDate,
  formatDateTime,
  greeting,
} from '../../lib/api.js';
import {
  Badge,
  Button,
  Card,
  CardGridSkeleton,
  Cover,
  Disclosure,
  EmptyState,
  ErrorState,
  InputField,
  LinkButton,
  Modal,
  PageHeader,
  PageSkeleton,
  ProgressBar,
  ProgressRing,
  RichText,
  SectionHeading,
  Skeleton,
  StatCard,
  Tabs,
  TextAreaField,
  Toggle,
  cn,
} from '../../components/ui/index.js';
import { ArrowLink, ResourceCard, SessionRow } from '../../components/ui/Cards.js';
import type {
  Assignment,
  Course,
  CourseModule,
  LearningResource,
  Lesson,
  LiveSession,
  Order,
  Quiz,
} from '../../../shared/types.js';

interface EnrolledCourse {
  enrollment_id: string;
  course_id: string;
  enrollment_status: string;
  last_accessed_lesson_id?: string | null;
  slug: string;
  title: string;
  subtitle?: string | null;
  level: string;
  duration_hours: number;
  instructor_name?: string;
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
}

type DashSession = LiveSession & { can_join?: boolean };

interface DashboardData {
  enrolledCourses: EnrolledCourse[];
  myResources: LearningResource[];
  liveSessions: DashSession[];
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    course_title?: string | null;
    author_name?: string;
    created_at: string;
  }>;
}

function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiRequest<DashboardData>('/api/learning/dashboard'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your learning data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

/* ============================================================================
   OVERVIEW
   ============================================================================ */
export const StudentDashboardPage: React.FC = () => {
  const { user } = useApp();
  const { data, loading, error, reload } = useDashboard();

  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error || 'Nothing to show.'} onRetry={reload} />;

  const courses = data.enrolledCourses;
  const resume = courses.find((c) => c.progress_percent < 100) ?? courses[0];
  const upcoming = data.liveSessions.filter((s) => s.can_join && (s.status === 'live' || s.status === 'scheduled'));
  const lessonsDone = courses.reduce((n, c) => n + c.completed_lessons, 0);
  const inProgress = courses.filter((c) => c.progress_percent < 100).length;

  return (
    <div className="space-y-10">
      <PageHeader
        title={`${greeting()}, ${firstName(user?.full_name)}`}
        description="Pick up where you left off, or see what's coming up."
        actions={
          <LinkButton to="/courses" variant="secondary" size="sm">
            Browse courses
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Courses in progress" value={inProgress} icon={<GraduationCap className="size-5" />} />
        <StatCard label="Lessons completed" value={lessonsDone} icon={<CheckCircle2 className="size-5" />} />
        <StatCard
          label="Live sessions ahead"
          value={upcoming.length}
          hint={upcoming[0] ? upcoming[0].title : 'Nothing scheduled'}
          icon={<Radio className="size-5" />}
        />
      </div>

      {resume ? (
        <Card tone="night" padding="none" className="overflow-hidden">
          <div className="grid items-center gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="text-sm text-white/55">Continue learning</p>
              <h2 className="display mt-2 text-3xl leading-tight sm:text-4xl">{resume.title}</h2>
              <p className="mt-3 text-sm text-white/65">
                {resume.completed_lessons} of {resume.total_lessons} lessons complete
              </p>
              <LinkButton
                variant="light"
                size="lg"
                className="mt-6"
                icon={<Play className="size-4" />}
                to={`/student/workspace/${resume.course_id}${resume.last_accessed_lesson_id ? `?lessonId=${resume.last_accessed_lesson_id}` : ''}`}
              >
                Resume
              </LinkButton>
            </div>
            <div className="hidden md:block">
              <ProgressRing value={resume.progress_percent} size={112} stroke={8} tone="light" />
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="You haven't enrolled in anything yet"
          description="Start with a free course or browse the catalogue."
          action={<LinkButton to="/courses">Explore courses</LinkButton>}
          icon={<GraduationCap className="size-6" />}
        />
      )}

      <div className="grid gap-10 xl:grid-cols-5">
        <div className="space-y-10 xl:col-span-3">
          {courses.length > 0 && (
            <section>
              <SectionHeading title="Your courses" action={<ArrowLink to="/student/learning">See all</ArrowLink>} />
              <div className="space-y-3">
                {courses.slice(0, 4).map((c) => (
                  <Card key={c.course_id} interactive padding="sm" className="flex items-center gap-4 p-4">
                    <Cover seed={c.slug} className="hidden h-16 w-24 shrink-0 sm:block" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/student/workspace/${c.course_id}`}
                        className="block truncate font-medium after:absolute after:inset-0 after:rounded-3xl"
                      >
                        {c.title}
                      </Link>
                      <p className="mb-2 mt-0.5 truncate text-[13px] text-ink-3">{c.instructor_name}</p>
                      <ProgressBar value={c.progress_percent} showValue={false} />
                    </div>
                    <span className="w-10 text-right text-sm font-medium tabular-nums">{c.progress_percent}%</span>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeading title="Up next live" action={<ArrowLink to="/student/live">Schedule</ArrowLink>} />
            {upcoming.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-sm text-ink-3">
                No live sessions scheduled for your courses.
              </p>
            ) : (
              <div className="space-y-3">
                {upcoming.slice(0, 3).map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    action={
                      <LinkButton to={`/classroom/${s.id}`} size="sm" variant={s.status === 'live' ? 'accent' : 'secondary'}>
                        {s.status === 'live' ? 'Join' : 'Open'}
                      </LinkButton>
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-10 xl:col-span-2">
          <section>
            <SectionHeading title="Announcements" />
            {data.announcements.length === 0 ? (
              <p className="text-sm text-ink-3">Nothing new.</p>
            ) : (
              <div className="space-y-3">
                {data.announcements.slice(0, 3).map((a) => (
                  <Card key={a.id} tone="tint" padding="sm" className="p-5">
                    <p className="text-xs text-ink-3">
                      {a.course_title || 'Academy'} · {formatDate(a.created_at)}
                    </p>
                    <p className="mt-1.5 font-medium">{a.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{a.body}</p>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {data.myResources.length > 0 && (
            <section>
              <SectionHeading title="In your library" action={<ArrowLink to="/student/library">Open</ArrowLink>} />
              <ul className="space-y-2">
                {data.myResources.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/student/library"
                      className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5 transition-colors hover:border-line-strong"
                    >
                      <span className="grid size-10 place-items-center rounded-xl bg-sky text-sky-ink">
                        <FileText className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                      <ChevronRight className="size-4 text-ink-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   MY LEARNING
   ============================================================================ */
export const MyLearningPage: React.FC = () => {
  const { data, loading, error, reload } = useDashboard();
  const [tab, setTab] = useState<'all' | 'progress' | 'done'>('all');

  const list = useMemo(() => {
    const all = data?.enrolledCourses ?? [];
    if (tab === 'progress') return all.filter((c) => c.progress_percent < 100);
    if (tab === 'done') return all.filter((c) => c.progress_percent === 100);
    return all;
  }, [data, tab]);

  return (
    <div className="space-y-8">
      <PageHeader title="My learning" description="Everything you're enrolled in, with your progress." />
      <Tabs
        id="learning-tab"
        value={tab}
        onChange={setTab}
        label="Filter courses"
        items={[
          { id: 'all', label: 'All', count: data?.enrolledCourses.length },
          { id: 'progress', label: 'In progress' },
          { id: 'done', label: 'Completed' },
        ]}
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <CardGridSkeleton count={3} />
      ) : list.length === 0 ? (
        <EmptyState
          title={tab === 'done' ? 'Nothing completed yet' : 'No courses here'}
          description="Enrol in a course and it will show up here."
          action={<LinkButton to="/courses">Browse courses</LinkButton>}
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <Card key={c.course_id} interactive padding="none" className="flex flex-col p-3">
              <Cover seed={c.slug} className="h-36" />
              <div className="flex flex-1 flex-col px-2 pb-2 pt-4">
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>{c.level}</span>
                  {c.progress_percent === 100 && <Badge tone="success" dot>Completed</Badge>}
                </div>
                <h3 className="display mt-2 text-xl leading-snug">
                  <Link to={`/student/workspace/${c.course_id}`} className="after:absolute after:inset-0 after:rounded-3xl">
                    {c.title}
                  </Link>
                </h3>
                <p className="mt-1 text-[13px] text-ink-3">{c.instructor_name}</p>
                <div className="mt-auto pt-5">
                  <ProgressBar value={c.progress_percent} label={`${c.completed_lessons} of ${c.total_lessons} lessons`} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   LEARNING WORKSPACE
   ============================================================================ */
type ActiveLesson = Lesson & { signed_stream_url?: string; signed_download_url?: string | null };

export const LearningWorkspacePage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { notify } = useApp();

  const [course, setCourse] = useState<(Course & { has_access?: boolean }) | null>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [active, setActive] = useState<ActiveLesson | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const attempted = useRef<string | null>(null);

  const requested = searchParams.get('lessonId');
  const flat = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);

  useEffect(() => {
    if (!courseId) return;
    setLoadingCourse(true);
    apiRequest<{ course: Course & { has_access?: boolean }; modules: CourseModule[] }>(`/api/catalog/courses/${courseId}`)
      .then((d) => {
        setCourse(d.course);
        setModules(d.modules || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to open this course.'))
      .finally(() => setLoadingCourse(false));
  }, [courseId]);

  const selectLesson = useCallback(
    async (lessonId: string) => {
      if (!courseId) return;
      attempted.current = lessonId;
      setLoadingLesson(true);
      setLessonError(null);
      try {
        const res = await apiRequest<{ lesson: ActiveLesson }>(`/api/learning/courses/${courseId}/lessons/${lessonId}`);
        setActive(res.lesson);
        setSearchParams({ lessonId }, { replace: true });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        setActive(null);
        setLessonError(err instanceof Error ? err.message : 'This lesson is locked.');
      } finally {
        setLoadingLesson(false);
      }
    },
    [courseId, setSearchParams]
  );

  useEffect(() => {
    if (flat.length === 0) return;
    const target =
      requested || flat.find((l) => !l.locked && !l.completed)?.id || flat.find((l) => !l.locked)?.id || flat[0].id;
    if (target && attempted.current !== target) selectLesson(target);
  }, [flat, requested, selectLesson]);

  const setCompleted = async (done: boolean) => {
    if (!active) return;
    setSaving(true);
    try {
      await apiRequest(`/api/learning/lessons/${active.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({ completed: done }),
      });
      setActive((p) => (p ? { ...p, completed: done } : p));
      setModules((prev) =>
        prev.map((m) => ({ ...m, lessons: m.lessons.map((l) => (l.id === active.id ? { ...l, completed: done } : l)) }))
      );
      if (done) notify({ type: 'success', title: 'Lesson completed' });
    } catch (err) {
      notify({ type: 'error', title: "Couldn't save progress", message: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  if (loadingCourse) return <PageSkeleton />;
  if (error || !course) return <ErrorState message={error || 'Course not found.'} />;

  const idx = flat.findIndex((l) => l.id === active?.id);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  const doneCount = flat.filter((l) => l.completed).length;
  const pct = flat.length ? Math.round((doneCount / flat.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link to={`/courses/${course.slug}`} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
            <ChevronLeft className="size-4" /> Course overview
          </Link>
          <h1 className="display truncate text-3xl sm:text-4xl">{course.title}</h1>
        </div>
        <div className="w-full sm:w-64">
          <ProgressBar value={pct} label={`${doneCount} of ${flat.length} done`} />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          {lessonError ? (
            <Card className="text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-ink/6">
                <Lock className="size-6 text-ink-2" />
              </div>
              <h2 className="display text-2xl">This lesson is locked</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-3">{lessonError}</p>
              <LinkButton to={`/courses/${course.slug}`} className="mt-6">
                View enrolment options
              </LinkButton>
            </Card>
          ) : loadingLesson || !active ? (
            <Skeleton className="h-[28rem] rounded-3xl" />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="space-y-5"
              >
                <Card padding="lg">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone="sky" className="capitalize">{active.content_type}</Badge>
                    <span className="inline-flex items-center gap-1 text-ink-3">
                      <Clock className="size-3.5" /> {active.duration_minutes} min
                    </span>
                    {active.completed && <Badge tone="success" dot>Completed</Badge>}
                  </div>
                  <h2 className="display mt-4 text-3xl sm:text-4xl">{active.title}</h2>
                  {active.description && <p className="mt-3 max-w-2xl text-ink-3">{active.description}</p>}

                  <div className="my-8 border-t border-line" />

                  <RichText text={active.article_body || 'Lesson notes will appear here.'} />

                  {active.signed_download_url && (
                    <div className="mt-8 border-t border-line pt-6">
                      <LinkButton href={active.signed_download_url} download variant="secondary" size="sm" icon={<Download className="size-4" />}>
                        Download lesson notes
                      </LinkButton>
                    </div>
                  )}
                </Card>

                <div className="glass sticky bottom-24 z-10 flex flex-wrap items-center justify-between gap-3 rounded-full p-2 pl-3 lg:bottom-6">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" disabled={!prev} onClick={() => prev && selectLesson(prev.id)} icon={<ChevronLeft className="size-4" />}>
                      Previous
                    </Button>
                    <Button variant="ghost" size="sm" disabled={!next} onClick={() => next && selectLesson(next.id)} iconRight={<ChevronRight className="size-4" />}>
                      Next
                    </Button>
                  </div>
                  <Button
                    variant={active.completed ? 'secondary' : 'primary'}
                    loading={saving}
                    onClick={() => setCompleted(!active.completed)}
                    icon={<Check className="size-4" />}
                  >
                    {active.completed ? 'Completed' : 'Mark complete'}
                  </Button>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <aside aria-label="Course curriculum" className="space-y-3 lg:sticky lg:top-28 lg:col-span-4">
          {modules.map((mod) => (
            <Disclosure
              key={mod.id}
              defaultOpen={mod.lessons.some((l) => l.id === active?.id) || mod === modules[0]}
              title={mod.title}
              meta={`${mod.lessons.filter((l) => l.completed).length}/${mod.lessons.length} complete`}
            >
              <ul className="p-2">
                {mod.lessons.map((l) => {
                  const current = l.id === active?.id;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => selectLesson(l.id)}
                        aria-current={current ? 'true' : undefined}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                          current ? 'bg-ink text-on-ink' : 'hover:bg-ink/5'
                        )}
                      >
                        <span className="grid size-5 shrink-0 place-items-center">
                          {l.locked ? (
                            <Lock className="size-4 opacity-60" />
                          ) : l.completed ? (
                            <CheckCircle2 className={cn('size-[18px]', current ? '' : 'text-success')} />
                          ) : (
                            <Play className="size-4 opacity-70" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{l.title}</span>
                        <span className="text-xs tabular-nums opacity-60">{l.duration_minutes}m</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Disclosure>
          ))}
        </aside>
      </div>
    </div>
  );
};

/* ============================================================================
   LIBRARY
   ============================================================================ */
export const MyLibraryPage: React.FC = () => {
  const { notify } = useApp();
  const { data, loading, error, reload } = useDashboard();
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState<{ resource: LearningResource; view: string; download: string | null } | null>(null);

  const list = (data?.myResources ?? []).filter((r) => r.title.toLowerCase().includes(search.trim().toLowerCase()));

  const open = async (r: LearningResource) => {
    try {
      const d = await apiRequest<{ resource: LearningResource; signedViewUrl: string; signedDownloadUrl: string | null }>(
        `/api/learning/resources/${r.id}/access`
      );
      setOpened({ resource: d.resource, view: d.signedViewUrl, download: d.signedDownloadUrl });
    } catch (err) {
      notify({ type: 'error', title: "Couldn't open file", message: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Library"
        description="Books and guides you own. Links are private and short-lived."
        actions={<LinkButton to="/resources" variant="secondary" size="sm">Browse store</LinkButton>}
      />
      <InputField
        wrapperClassName="max-w-sm"
        type="search"
        aria-label="Search your library"
        placeholder="Search your library"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leading={<Search className="size-4" />}
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <CardGridSkeleton count={3} />
      ) : list.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'Your library is empty'}
          description={search ? 'Try a different search.' : 'Books and guides you unlock will appear here.'}
          icon={<BookOpen className="size-6" />}
          action={!search && <LinkButton to="/resources">Browse library</LinkButton>}
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <ResourceCard
              key={r.id}
              resource={{ ...r, has_access: true }}
              action={
                <Button size="sm" variant="secondary" onClick={() => open(r)} icon={<BookOpen className="size-4" />}>
                  Open
                </Button>
              }
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(opened)}
        onClose={() => setOpened(null)}
        title={opened?.resource.title ?? ''}
        description="Links expire after 15 minutes."
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
        {opened && <p className="text-sm leading-relaxed text-ink-2">{opened.resource.description}</p>}
      </Modal>
    </div>
  );
};

/* ============================================================================
   LIVE CLASSES
   ============================================================================ */
export const StudentLiveClassesPage: React.FC = () => {
  const { data, loading, error, reload } = useDashboard();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const mine = (data?.liveSessions ?? []).filter((s) => s.can_join);
  const upcoming = mine.filter((s) => s.status === 'live' || s.status === 'scheduled');
  const past = mine.filter((s) => s.status === 'ended');
  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="space-y-8">
      <PageHeader title="Live classes" description="Times are shown in your local time zone." />
      <Tabs
        id="live-tab"
        value={tab}
        onChange={setTab}
        label="Sessions"
        items={[
          { id: 'upcoming', label: 'Upcoming', count: upcoming.length },
          { id: 'past', label: 'Past', count: past.length },
        ]}
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : list.length === 0 ? (
        <EmptyState
          title={tab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'}
          description={tab === 'upcoming' ? 'When an instructor schedules a class for one of your courses, it will appear here.' : undefined}
          icon={<Radio className="size-6" />}
        />
      ) : (
        <div className="space-y-3">
          {list.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              action={
                s.status === 'ended' ? (
                  <Badge>Ended</Badge>
                ) : (
                  <LinkButton to={`/classroom/${s.id}`} size="sm" variant={s.status === 'live' ? 'accent' : 'secondary'}>
                    {s.status === 'live' ? 'Join now' : 'Open'}
                  </LinkButton>
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   ASSESSMENTS
   ============================================================================ */
interface QuizResult {
  scorePercent: number;
  passed: boolean;
  passingScore: number;
  feedback: Array<{ questionId: string; selectedOption: number | null; correctOption: number; isCorrect: boolean; explanation?: string | null }>;
}

function QuizRunner({ quiz, onClose, onDone }: { quiz: Quiz; onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const q = quiz.questions[step];
  const last = step === quiz.questions.length - 1;
  const allAnswered = quiz.questions.every((x) => answers[x.id] !== undefined);

  const submit = async () => {
    setSubmitting(true);
    try {
      setResult(
        await apiRequest<QuizResult>(`/api/learning/quizzes/${quiz.id}/submit`, {
          method: 'POST',
          body: JSON.stringify({ answers }),
        })
      );
      onDone();
    } catch (err) {
      notify({ type: 'error', title: "Couldn't submit", message: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-5 rounded-2xl bg-canvas p-5">
          <ProgressRing value={result.scorePercent} size={84} />
          <div>
            <p className="display text-2xl">{result.passed ? 'You passed' : 'Not quite yet'}</p>
            <p className="text-sm text-ink-3">Pass mark is {result.passingScore}%. You can retake this any time.</p>
          </div>
        </div>
        <ol className="space-y-3">
          {quiz.questions.map((qn, i) => {
            const fb = result.feedback.find((f) => f.questionId === qn.id);
            return (
              <li key={qn.id} className="rounded-2xl border border-line p-4">
                <div className="flex gap-3">
                  <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold', fb?.isCorrect ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{qn.prompt}</p>
                    <p className="mt-2 text-ink-3">
                      Your answer: <span className="text-ink">{fb?.selectedOption != null ? qn.options[fb.selectedOption] : 'No answer'}</span>
                    </p>
                    {!fb?.isCorrect && fb && (
                      <p className="mt-1 text-ink-3">Correct: <span className="text-success">{qn.options[fb.correctOption]}</span></p>
                    )}
                    {fb?.explanation && <p className="mt-2 rounded-xl bg-ink/5 px-3 py-2 text-[13px] text-ink-2">{fb.explanation}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            icon={<RotateCcw className="size-4" />}
            onClick={() => {
              setResult(null);
              setAnswers({});
              setStep(0);
            }}
          >
            Retake
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between text-xs text-ink-3">
          <span>Question {step + 1} of {quiz.questions.length}</span>
          <span>{Object.keys(answers).length} answered</span>
        </div>
        <ProgressBar value={((step + 1) / quiz.questions.length) * 100} showValue={false} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={q.id} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.2 }}>
          <fieldset>
            <legend className="display text-2xl leading-snug">{q.prompt}</legend>
            <div role="radiogroup" className="mt-5 space-y-2.5">
              {q.options.map((opt, i) => {
                const selected = answers[q.id] === i;
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-2xl border p-4 text-left text-sm transition-all duration-150',
                      selected ? 'border-ink bg-ink/4 ring-1 ring-ink' : 'border-line-strong hover:border-ink/50'
                    )}
                  >
                    <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border', selected ? 'border-ink bg-ink text-on-ink' : 'border-line-strong')}>
                      {selected && <Check className="size-3" />}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </motion.div>
      </AnimatePresence>
      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)} icon={<ChevronLeft className="size-4" />}>
          Back
        </Button>
        {last ? (
          <Button disabled={!allAnswered} loading={submitting} onClick={submit}>
            Submit answers
          </Button>
        ) : (
          <Button disabled={answers[q.id] === undefined} onClick={() => setStep((s) => s + 1)} iconRight={<ChevronRight className="size-4" />}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

export const AssessmentsPage: React.FC = () => {
  const { notify } = useApp();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tab, setTab] = useState<'quizzes' | 'assignments'>('quizzes');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<Quiz | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<{ quizzes: Quiz[]; assignments: Assignment[] }>('/api/learning/assessments');
      setQuizzes(res.quizzes || []);
      setAssignments(res.assignments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assessments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitAssignment = async (a: Assignment) => {
    const text = (drafts[a.id] ?? a.submission?.submission_text ?? '').trim();
    setSending(a.id);
    try {
      await apiRequest(`/api/learning/assignments/${a.id}/submit`, { method: 'POST', body: JSON.stringify({ submission_text: text }) });
      notify({ type: 'success', title: 'Assignment submitted', message: 'Your instructor will review it.' });
      await load();
    } catch (err) {
      notify({ type: 'error', title: "Couldn't submit", message: err instanceof Error ? err.message : undefined });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Assessments" description="Check your understanding and get feedback from instructors." />
      <Tabs
        id="assess-tab"
        value={tab}
        onChange={setTab}
        label="Assessment type"
        items={[
          { id: 'quizzes', label: 'Quizzes', count: quizzes.length },
          { id: 'assignments', label: 'Assignments', count: assignments.length },
        ]}
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : tab === 'quizzes' ? (
        quizzes.length === 0 ? (
          <EmptyState title="No quizzes yet" description="Quizzes for your enrolled courses will show up here." icon={<Trophy className="size-6" />} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {quizzes.map((q) => (
              <Card key={q.id} className="flex flex-col">
                <p className="text-xs text-ink-3">{q.course_title}</p>
                <h3 className="display mt-1 text-2xl leading-snug">{q.title}</h3>
                {q.description && <p className="mt-2 text-sm text-ink-3">{q.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-3 pt-6">
                  <span className="flex items-center gap-2 text-sm">
                    {q.latest_attempt ? (
                      <Badge tone={q.latest_attempt.passed ? 'success' : 'warn'} dot>
                        {q.latest_attempt.passed ? 'Passed' : 'Try again'} · {q.latest_attempt.score_percent}%
                      </Badge>
                    ) : (
                      <Badge>{q.questions.length} questions</Badge>
                    )}
                  </span>
                  <Button size="sm" onClick={() => setRunning(q)}>
                    {q.latest_attempt ? 'Retake' : 'Start'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : assignments.length === 0 ? (
        <EmptyState title="No assignments yet" description="Assignments for your courses will show up here." icon={<FileText className="size-6" />} />
      ) : (
        <div className="space-y-5">
          {assignments.map((a) => {
            const s = a.submission;
            const graded = s?.status === 'graded';
            return (
              <Card key={a.id} className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-ink-3">{a.course_title}</p>
                    <h3 className="display mt-1 text-2xl">{a.title}</h3>
                  </div>
                  {s ? (
                    <Badge tone={graded ? 'success' : 'sky'} dot>
                      {graded ? `Graded · ${s.score}/${a.max_score}` : s.status === 'revision_requested' ? 'Revision requested' : 'Submitted'}
                    </Badge>
                  ) : (
                    <Badge>{a.max_score} points</Badge>
                  )}
                </div>
                <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">{a.instructions}</p>
                {s?.feedback && (
                  <div className="rounded-2xl bg-success-soft px-4 py-3 text-sm text-ink">
                    <p className="mb-1 text-xs font-medium text-success">Instructor feedback</p>
                    {s.feedback}
                  </div>
                )}
                <TextAreaField
                  label="Your answer"
                  rows={5}
                  value={drafts[a.id] ?? s?.submission_text ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                  placeholder="Write your response, or paste a link to your work."
                  hint="At least 10 characters."
                />
                <div className="flex justify-end">
                  <Button loading={sending === a.id} onClick={() => submitAssignment(a)} icon={<Send className="size-4" />}>
                    {s ? 'Update submission' : 'Submit'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(running)} onClose={() => setRunning(null)} title={running?.title ?? ''} description={running?.course_title} size="lg">
        {running && <QuizRunner key={running.id} quiz={running} onClose={() => setRunning(null)} onDone={load} />}
      </Modal>
    </div>
  );
};

/* ============================================================================
   ACCOUNT
   ============================================================================ */
export const StudentAccountPage: React.FC = () => {
  const { user, refreshAuth, notify } = useApp();
  const [tab, setTab] = useState<'profile' | 'security' | 'notifications' | 'receipts'>('profile');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [title, setTitle] = useState(user?.title || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [prefs, setPrefs] = useState(user?.notification_prefs ?? { email_classes: true, email_receipts: true, in_app: true });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setTitle(user.title || '');
      setBio(user.bio || '');
      setPrefs(user.notification_prefs);
    }
  }, [user]);

  useEffect(() => {
    if (tab === 'receipts' && orders === null) {
      apiRequest<{ orders: Order[] }>('/api/payments/orders')
        .then((r) => setOrders(r.orders || []))
        .catch(() => setOrders([]));
    }
  }, [tab, orders]);

  const save = async (payload: Record<string, unknown>, success: string) => {
    setSaving(true);
    try {
      await apiRequest('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      await refreshAuth();
      notify({ type: 'success', title: success });
      return true;
    } catch (err) {
      notify({ type: 'error', title: "Couldn't save", message: err instanceof Error ? err.message : undefined });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Account" description="Your profile, security, notifications and receipts." />
      <Tabs
        id="account-tab"
        value={tab}
        onChange={setTab}
        label="Account sections"
        items={[
          { id: 'profile', label: 'Profile' },
          { id: 'security', label: 'Security' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'receipts', label: 'Receipts' },
        ]}
      />

      <div className="max-w-2xl">
        {tab === 'profile' && (
          <Card>
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                save({ full_name: fullName, title, bio }, 'Profile saved');
              }}
            >
              <InputField label="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <InputField label="Email" value={user?.email ?? ''} disabled hint="Contact support to change your email." readOnly />
              <InputField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Software engineer" />
              <TextAreaField label="About you" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
              <Button type="submit" loading={saving}>Save changes</Button>
            </form>
          </Card>
        )}

        {tab === 'security' && (
          <Card>
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await save({ currentPassword, newPassword }, 'Password updated')) {
                  setCurrentPassword('');
                  setNewPassword('');
                }
              }}
            >
              <InputField label="Current password" type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              <InputField label="New password" type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} hint="At least 8 characters." />
              <Button type="submit" loading={saving}>Update password</Button>
            </form>
          </Card>
        )}

        {tab === 'notifications' && (
          <Card className="space-y-3 divide-y divide-line">
            <Toggle label="Class reminders by email" description="A reminder before live classes you're enrolled in." checked={prefs.email_classes} onChange={(v) => { const n = { ...prefs, email_classes: v }; setPrefs(n); save({ notification_prefs: n }, 'Preferences saved'); }} />
            <div className="pt-3"><Toggle label="Payment receipts by email" description="A receipt whenever a payment is confirmed." checked={prefs.email_receipts} onChange={(v) => { const n = { ...prefs, email_receipts: v }; setPrefs(n); save({ notification_prefs: n }, 'Preferences saved'); }} /></div>
            <div className="pt-3"><Toggle label="In-app notifications" description="Show updates under the bell icon." checked={prefs.in_app} onChange={(v) => { const n = { ...prefs, in_app: v }; setPrefs(n); save({ notification_prefs: n }, 'Preferences saved'); }} /></div>
          </Card>
        )}

        {tab === 'receipts' &&
          (orders === null ? (
            <Skeleton className="h-48 rounded-3xl" />
          ) : orders.length === 0 ? (
            <EmptyState title="No payments yet" description="Receipts for your purchases will appear here." icon={<Receipt className="size-6" />} />
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/checkout/result?orderId=${o.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-line-strong"
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-ink/6">
                      <Receipt className="size-5 text-ink-2" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.items?.[0]?.title_snapshot ?? o.order_number}</span>
                      <span className="block text-xs text-ink-3">{o.order_number} · {formatDateTime(o.created_at)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">{formatCurrency(o.total_amount, o.currency)}</span>
                      <Badge tone={o.status === 'paid' ? 'success' : o.status === 'pending' ? 'warn' : 'danger'} className="mt-1 capitalize">
                        {o.status.replace('_', ' ')}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
};
