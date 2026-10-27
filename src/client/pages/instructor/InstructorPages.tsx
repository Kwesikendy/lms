import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarPlus,
  CheckCircle2,
  Eye,
  FileUp,
  Megaphone,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import {
  apiRequest,
  apiUploadJson,
  fileSizeLabel,
  formatCurrency,
  formatDate,
  formatDateTime,
  timeZoneLabel,
  toLocalInputValue,
} from '../../lib/api.js';
import {
  Badge,
  Button,
  Card,
  Chip,
  Cover,
  EmptyState,
  ErrorState,
  InputField,
  LinkButton,
  Modal,
  PageHeader,
  PageSkeleton,
  ProgressBar,
  SelectField,
  Skeleton,
  StatCard,
  Tabs,
  TextAreaField,
  Toggle,
  cn,
} from '../../components/ui/index.js';
import { SessionRow } from '../../components/ui/Cards.js';
import type { Course, CourseCategory, CourseModule, LearningResource, LiveSession } from '../../../shared/types.js';

interface OverviewData {
  courses: Course[];
  resources: LearningResource[];
  liveSessions: LiveSession[];
  enrolledStudents: Array<{
    enrollment_id: string;
    course_id: string;
    course_title: string;
    student_id: string;
    student_name: string;
    student_email: string;
    enrolled_at: string;
    total_lessons: number;
    completed_lessons: number;
  }>;
  submissions: Array<{
    id: string;
    assignment_title: string;
    course_title: string;
    student_name: string;
    submission_text: string;
    status: string;
    score?: number | null;
    feedback?: string | null;
    max_score: number;
    submitted_at: string;
  }>;
}

function useOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiRequest<OverviewData>('/api/instructor/overview'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your studio.');
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
   STUDIO OVERVIEW
   ============================================================================ */
export const InstructorDashboardPage: React.FC = () => {
  const { user } = useApp();
  const { data, loading, error, reload } = useOverview();

  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error || 'Nothing to show.'} onRetry={reload} />;

  const upcoming = data.liveSessions.filter((s) => s.status === 'live' || s.status === 'scheduled');

  return (
    <div className="space-y-10">
      <PageHeader
        title="Studio"
        description={`Welcome back, ${user?.full_name.split(' ')[0]}. Here's what's happening across your courses.`}
        actions={
          <>
            <LinkButton to="/instructor/live" variant="secondary" size="sm" icon={<CalendarPlus className="size-4" />}>
              Schedule class
            </LinkButton>
            <LinkButton to="/instructor/courses" size="sm" icon={<Plus className="size-4" />}>
              New course
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Courses" value={data.courses.length} icon={<BookOpen className="size-5" />} />
        <StatCard label="Enrolled students" value={data.enrolledStudents.length} icon={<Users className="size-5" />} />
        <StatCard label="Library resources" value={data.resources.length} icon={<Upload className="size-5" />} />
        <StatCard label="Upcoming classes" value={upcoming.length} icon={<Radio className="size-5" />} />
      </div>

      <div className="grid gap-10 xl:grid-cols-5">
        <section className="space-y-4 xl:col-span-3">
          <h2 className="display text-2xl">Your courses</h2>
          {data.courses.length === 0 ? (
            <EmptyState title="No courses yet" description="Create your first course to get started." action={<LinkButton to="/instructor/courses">Create a course</LinkButton>} />
          ) : (
            data.courses.map((c) => (
              <Card key={c.id} interactive padding="sm" className="flex items-center gap-4 p-4">
                <Cover seed={c.slug} className="hidden h-16 w-24 shrink-0 sm:block" />
                <div className="min-w-0 flex-1">
                  <Link to={`/instructor/courses?courseId=${c.id}`} className="block truncate font-medium after:absolute after:inset-0 after:rounded-3xl">
                    {c.title}
                  </Link>
                  <p className="mt-1 text-[13px] text-ink-3">
                    {c.enrollment_count ?? 0} students · {c.lesson_count ?? 0} lessons ·{' '}
                    {c.is_free ? 'Free' : formatCurrency(c.price_ghs, c.currency)}
                  </p>
                </div>
                <Badge tone={c.status === 'published' ? 'success' : 'warn'} dot className="capitalize">
                  {c.status}
                </Badge>
              </Card>
            ))
          )}
        </section>

        <section className="space-y-4 xl:col-span-2">
          <h2 className="display text-2xl">Upcoming classes</h2>
          {upcoming.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-sm text-ink-3">Nothing scheduled.</p>
          ) : (
            upcoming.slice(0, 4).map((s) => (
              <SessionRow
                key={s.id}
                compact
                session={s}
                action={
                  <LinkButton to={`/classroom/${s.id}`} size="sm" variant={s.status === 'live' ? 'accent' : 'secondary'}>
                    {s.status === 'live' ? 'Enter' : 'Start'}
                  </LinkButton>
                }
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
};

/* ============================================================================
   COURSE EDITOR
   ============================================================================ */
const levels = ['Beginner', 'Intermediate', 'Advanced', 'All Levels'] as const;

export const InstructorCourseEditorPage: React.FC = () => {
  const { notify } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, reload } = useOverview();
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [tab, setTab] = useState<'curriculum' | 'details'>('curriculum');
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [lessonFor, setLessonFor] = useState<CourseModule | null>(null);
  const [moduleTitle, setModuleTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedId = searchParams.get('courseId') || data?.courses[0]?.id || '';
  const course = data?.courses.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    apiRequest<{ categories: CourseCategory[] }>('/api/catalog/categories')
      .then((r) => setCategories(r.categories || []))
      .catch(() => undefined);
  }, []);

  const loadCurriculum = useCallback(async () => {
    if (!selectedId) return;
    try {
      const r = await apiRequest<{ modules: CourseModule[] }>(`/api/catalog/courses/${selectedId}`);
      setModules(r.modules || []);
    } catch {
      setModules([]);
    }
  }, [selectedId]);

  useEffect(() => {
    loadCurriculum();
  }, [loadCurriculum]);

  // new-course form
  const [nc, setNc] = useState({
    title: '',
    subtitle: '',
    description: '',
    category_id: '',
    level: 'Intermediate' as (typeof levels)[number],
    is_free: false,
    price: '',
    outcomes: '',
    publish: false,
  });

  const createCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiRequest<{ courseId: string }>('/api/instructor/courses', {
        method: 'POST',
        body: JSON.stringify({
          title: nc.title,
          subtitle: nc.subtitle,
          description: nc.description,
          category_id: nc.category_id || categories[0]?.id,
          level: nc.level,
          is_free: nc.is_free,
          price_ghs: nc.is_free ? 0 : Number(nc.price || 0),
          status: nc.publish ? 'published' : 'draft',
          learning_outcomes: nc.outcomes.split('\n').map((s) => s.trim()).filter(Boolean),
        }),
      });
      notify({ type: 'success', title: 'Course created', message: nc.publish ? 'It is live in the catalogue.' : 'Saved as a draft.' });
      setNewCourseOpen(false);
      setNc({ title: '', subtitle: '', description: '', category_id: '', level: 'Intermediate', is_free: false, price: '', outcomes: '', publish: false });
      await reload();
      setSearchParams({ courseId: res.courseId });
    } catch (err) {
      notify({ type: 'error', title: "Couldn't create course", message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const patchCourse = async (payload: Record<string, unknown>, ok: string) => {
    if (!course) return;
    setBusy(true);
    try {
      await apiRequest(`/api/instructor/courses/${course.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      await reload();
      notify({ type: 'success', title: ok });
    } catch (err) {
      notify({ type: 'error', title: "Couldn't save", message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const addModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course || !moduleTitle.trim()) return;
    try {
      await apiRequest(`/api/instructor/courses/${course.id}/modules`, { method: 'POST', body: JSON.stringify({ title: moduleTitle.trim() }) });
      setModuleTitle('');
      await loadCurriculum();
    } catch (err) {
      notify({ type: 'error', title: "Couldn't add module", message: err instanceof Error ? err.message : undefined });
    }
  };

  const moveLesson = async (mod: CourseModule, i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (!course || j < 0 || j >= mod.lessons.length) return;
    const order = [...mod.lessons];
    [order[i], order[j]] = [order[j], order[i]];
    // optimistic update, rolled back on failure
    const before = modules;
    setModules((ms) => ms.map((m) => (m.id === mod.id ? { ...m, lessons: order } : m)));
    try {
      await apiRequest(`/api/instructor/courses/${course.id}/reorder`, {
        method: 'POST',
        body: JSON.stringify({ lessonOrders: order.map((l, n) => ({ id: l.id, sort_order: n + 1 })) }),
      });
    } catch (err) {
      setModules(before);
      notify({ type: 'error', title: "Couldn't reorder", message: err instanceof Error ? err.message : undefined });
    }
  };

  // lesson form
  const [lf, setLf] = useState({ title: '', type: 'article', minutes: '15', body: '', preview: false, download: true });
  const addLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course || !lessonFor) return;
    setBusy(true);
    try {
      await apiRequest(`/api/instructor/courses/${course.id}/lessons`, {
        method: 'POST',
        body: JSON.stringify({
          module_id: lessonFor.id,
          title: lf.title,
          content_type: lf.type,
          duration_minutes: Number(lf.minutes) || 15,
          is_preview: lf.preview,
          allow_download: lf.download,
          article_body: lf.body || undefined,
        }),
      });
      setLessonFor(null);
      setLf({ title: '', type: 'article', minutes: '15', body: '', preview: false, download: true });
      await loadCurriculum();
      notify({ type: 'success', title: 'Lesson added' });
    } catch (err) {
      notify({ type: 'error', title: "Couldn't add lesson", message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  // details form
  const [df, setDf] = useState({ title: '', subtitle: '', description: '', category_id: '', level: 'Intermediate', is_free: false, price: '0' });
  useEffect(() => {
    if (course) {
      setDf({
        title: course.title,
        subtitle: course.subtitle || '',
        description: course.description,
        category_id: course.category_id || '',
        level: course.level,
        is_free: course.is_free,
        price: String(course.price_ghs),
      });
    }
  }, [course]);

  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error || 'Nothing to show.'} onRetry={reload} />;

  const catOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Courses"
        description="Build curriculum, set pricing and publish when you're ready."
        actions={<Button onClick={() => setNewCourseOpen(true)} icon={<Plus className="size-4" />}>New course</Button>}
      />

      {data.courses.length === 0 ? (
        <EmptyState title="Create your first course" description="Add modules and lessons, then publish it to the catalogue." action={<Button onClick={() => setNewCourseOpen(true)}>New course</Button>} />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-12">
          <nav aria-label="Your courses" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:col-span-3 lg:mx-0 lg:flex-col lg:px-0">
            {data.courses.map((c) => {
              const active = c.id === course?.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setSearchParams({ courseId: c.id })}
                  className={cn(
                    'w-64 shrink-0 rounded-2xl border p-4 text-left transition-all duration-200 lg:w-full',
                    active ? 'border-ink bg-card shadow-soft ring-1 ring-ink' : 'border-line bg-card hover:border-line-strong'
                  )}
                >
                  <span className="line-clamp-2 text-sm font-medium">{c.title}</span>
                  <span className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                    <span className={cn('size-1.5 rounded-full', c.status === 'published' ? 'bg-success' : 'bg-warn')} />
                    <span className="capitalize">{c.status}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {course && (
            <div className="space-y-6 lg:col-span-9">
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="display truncate text-2xl">{course.title}</h2>
                  <p className="mt-1 text-sm text-ink-3">
                    {course.is_free ? 'Free' : formatCurrency(course.price_ghs, course.currency)} · updated {formatDate(course.updated_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <LinkButton to={`/courses/${course.slug}`} variant="ghost" size="sm" icon={<Eye className="size-4" />}>
                    Preview
                  </LinkButton>
                  <Button
                    size="sm"
                    variant={course.status === 'published' ? 'secondary' : 'accent'}
                    loading={busy}
                    onClick={() => patchCourse({ status: course.status === 'published' ? 'draft' : 'published' }, course.status === 'published' ? 'Moved to drafts' : 'Published')}
                  >
                    {course.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                </div>
              </Card>

              <Tabs
                id="editor-tab"
                value={tab}
                onChange={setTab}
                label="Editor sections"
                items={[
                  { id: 'curriculum', label: 'Curriculum', count: modules.reduce((n, m) => n + m.lessons.length, 0) },
                  { id: 'details', label: 'Details & pricing' },
                ]}
              />

              {tab === 'curriculum' ? (
                <div className="space-y-4">
                  {modules.length === 0 && <EmptyState title="No modules yet" description="Add a module below, then fill it with lessons." />}
                  {modules.map((mod, mi) => (
                    <Card key={mod.id} padding="none" className="overflow-hidden">
                      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                        <h3 className="font-medium">
                          <span className="mr-2 text-ink-3">{mi + 1}.</span>
                          {mod.title}
                        </h3>
                        <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setLessonFor(mod)}>
                          Lesson
                        </Button>
                      </div>
                      {mod.lessons.length === 0 ? (
                        <p className="px-5 py-6 text-sm text-ink-3">No lessons in this module.</p>
                      ) : (
                        <ul className="divide-y divide-line">
                          {mod.lessons.map((l, i) => (
                            <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                              <span className="w-5 text-sm tabular-nums text-ink-3">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{l.title}</p>
                                <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                                  <span className="capitalize">{l.content_type}</span>·<span>{l.duration_minutes} min</span>
                                  {l.is_preview && <Badge tone="sky">Free preview</Badge>}
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <button type="button" aria-label={`Move ${l.title} up`} disabled={i === 0} onClick={() => moveLesson(mod, i, -1)} className="grid size-8 place-items-center rounded-full text-ink-2 transition-colors hover:bg-ink/6 disabled:opacity-30">
                                  <ArrowUp className="size-4" />
                                </button>
                                <button type="button" aria-label={`Move ${l.title} down`} disabled={i === mod.lessons.length - 1} onClick={() => moveLesson(mod, i, 1)} className="grid size-8 place-items-center rounded-full text-ink-2 transition-colors hover:bg-ink/6 disabled:opacity-30">
                                  <ArrowDown className="size-4" />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  ))}
                  <form onSubmit={addModule} className="flex gap-3">
                    <InputField wrapperClassName="flex-1" aria-label="New module title" placeholder="New module title, e.g. Module 2: Settlement" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} />
                    <Button type="submit" variant="secondary" disabled={!moduleTitle.trim()} className="h-11">
                      Add module
                    </Button>
                  </form>
                </div>
              ) : (
                <Card>
                  <form
                    className="space-y-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      patchCourse(
                        {
                          title: df.title,
                          subtitle: df.subtitle,
                          description: df.description,
                          category_id: df.category_id || undefined,
                          level: df.level,
                          is_free: df.is_free,
                          price_ghs: df.is_free ? 0 : Number(df.price || 0),
                        },
                        'Course details saved'
                      );
                    }}
                  >
                    <InputField label="Title" required value={df.title} onChange={(e) => setDf({ ...df, title: e.target.value })} />
                    <InputField label="Subtitle" value={df.subtitle} onChange={(e) => setDf({ ...df, subtitle: e.target.value })} />
                    <TextAreaField label="Description" required rows={5} value={df.description} onChange={(e) => setDf({ ...df, description: e.target.value })} />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <SelectField label="Category" value={df.category_id} onChange={(e) => setDf({ ...df, category_id: e.target.value })} options={catOptions} />
                      <SelectField label="Level" value={df.level} onChange={(e) => setDf({ ...df, level: e.target.value })} options={levels.map((l) => ({ value: l, label: l }))} />
                    </div>
                    <div className="grid items-end gap-5 sm:grid-cols-2">
                      <InputField label="Price (GHS)" type="number" min={0} step="1" disabled={df.is_free} value={df.is_free ? '0' : df.price} onChange={(e) => setDf({ ...df, price: e.target.value })} />
                      <Toggle label="Free course" checked={df.is_free} onChange={(v) => setDf({ ...df, is_free: v })} />
                    </div>
                    <Button type="submit" loading={busy}>Save changes</Button>
                  </form>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      <Modal open={newCourseOpen} onClose={() => setNewCourseOpen(false)} title="New course" description="You can edit everything later." size="lg">
        <form onSubmit={createCourse} className="space-y-5">
          <InputField label="Title" required data-autofocus value={nc.title} onChange={(e) => setNc({ ...nc, title: e.target.value })} />
          <InputField label="Subtitle" value={nc.subtitle} onChange={(e) => setNc({ ...nc, subtitle: e.target.value })} hint="One line on what learners will be able to do." />
          <TextAreaField label="Description" required minLength={15} rows={4} value={nc.description} onChange={(e) => setNc({ ...nc, description: e.target.value })} />
          <TextAreaField label="What learners will achieve" rows={3} value={nc.outcomes} onChange={(e) => setNc({ ...nc, outcomes: e.target.value })} hint="One outcome per line." />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Category" value={nc.category_id || catOptions[0]?.value || ''} onChange={(e) => setNc({ ...nc, category_id: e.target.value })} options={catOptions} />
            <SelectField label="Level" value={nc.level} onChange={(e) => setNc({ ...nc, level: e.target.value as typeof nc.level })} options={levels.map((l) => ({ value: l, label: l }))} />
          </div>
          <div className="grid items-end gap-5 sm:grid-cols-2">
            <InputField label="Price (GHS)" type="number" min={0} disabled={nc.is_free} value={nc.is_free ? '0' : nc.price} onChange={(e) => setNc({ ...nc, price: e.target.value })} />
            <Toggle label="Free course" checked={nc.is_free} onChange={(v) => setNc({ ...nc, is_free: v })} />
          </div>
          <Toggle label="Publish immediately" description="Otherwise it's saved as a draft." checked={nc.publish} onChange={(v) => setNc({ ...nc, publish: v })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setNewCourseOpen(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create course</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(lessonFor)} onClose={() => setLessonFor(null)} title="Add lesson" description={lessonFor?.title} size="lg">
        <form onSubmit={addLesson} className="space-y-5">
          <InputField label="Lesson title" required data-autofocus value={lf.title} onChange={(e) => setLf({ ...lf, title: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Format" value={lf.type} onChange={(e) => setLf({ ...lf, type: e.target.value })} options={[{ value: 'article', label: 'Article' }, { value: 'video', label: 'Video' }, { value: 'document', label: 'Document' }]} />
            <InputField label="Duration (minutes)" type="number" min={1} value={lf.minutes} onChange={(e) => setLf({ ...lf, minutes: e.target.value })} />
          </div>
          <TextAreaField label="Lesson notes" rows={6} value={lf.body} onChange={(e) => setLf({ ...lf, body: e.target.value })} hint="Supports headings (###), lists (-), **bold** and `code`." />
          <Toggle label="Free preview" description="Anyone can open this lesson before enrolling." checked={lf.preview} onChange={(v) => setLf({ ...lf, preview: v })} />
          <Toggle label="Allow notes download" checked={lf.download} onChange={(v) => setLf({ ...lf, download: v })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setLessonFor(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>Add lesson</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

/* ============================================================================
   RESOURCES (real upload with byte progress)
   ============================================================================ */
const MAX_JSON_UPLOAD = 10 * 1024 * 1024;
const extMime: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
  md: 'text/markdown',
};

function resolveMime(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type && Object.values(extMime).includes(file.type)) return file.type;
  return extMime[ext] ?? null;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export const InstructorResourceManagerPage: React.FC = () => {
  const { notify } = useApp();
  const { data, loading, error, reload } = useOverview();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [f, setF] = useState({
    title: '',
    description: '',
    type: 'pdf',
    courseId: '',
    free: false,
    price: '',
    download: true,
  });

  const pick = (picked: File | undefined | null) => {
    setUploadError(null);
    setProgress(0);
    if (!picked) return;
    if (!resolveMime(picked)) {
      setFile(null);
      setFileError('That file type is not supported. Use PDF, EPUB, MP4, WebM, MP3, M4A, PPTX, ZIP, TXT or Markdown.');
      return;
    }
    if (picked.size > MAX_JSON_UPLOAD) {
      setFile(null);
      setFileError(`This file is ${fileSizeLabel(picked.size)}. Direct uploads are limited to ${fileSizeLabel(MAX_JSON_UPLOAD)}; larger files need the object-storage upload path.`);
      return;
    }
    setFileError(null);
    setFile(picked);
    if (!f.title) setF((p) => ({ ...p, title: picked.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') }));
  };

  const upload = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!file) return;
    const mime = resolveMime(file);
    if (!mime) return;
    setUploading(true);
    setUploadError(null);
    setProgress(0);
    try {
      const content_base64 = await toBase64(file);
      await apiUploadJson(
        '/api/instructor/resources',
        {
          title: f.title,
          description: f.description,
          resource_type: f.type,
          course_id: f.courseId || null,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: mime,
          content_base64,
          is_free: f.free,
          price_ghs: f.free ? 0 : Number(f.price || 0),
          allow_download: f.download,
        },
        setProgress
      );
      notify({ type: 'success', title: 'Resource published', message: f.title });
      setFile(null);
      setProgress(0);
      setF((p) => ({ ...p, title: '', description: '' }));
      await reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error || 'Nothing to show.'} onRetry={reload} />;

  return (
    <div className="space-y-8">
      <PageHeader title="Resources" description="Upload books, guides and templates to the private library." />

      <div className="grid items-start gap-8 lg:grid-cols-12">
        <form onSubmit={upload} className="lg:col-span-5">
          <Card className="space-y-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                'rounded-2xl border-2 border-dashed p-6 text-center transition-colors duration-200',
                dragging ? 'border-ink bg-ink/5' : 'border-line-strong',
                fileError && 'border-danger'
              )}
            >
              <input ref={inputRef} type="file" className="sr-only" id="resource-file" onChange={(e) => pick(e.target.files?.[0])} />
              {file ? (
                <div className="flex items-center gap-3 text-left">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky text-sky-ink">
                    <FileUp className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-ink-3">{fileSizeLabel(file.size)}</p>
                  </div>
                  <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-ink/6 hover:text-ink">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-ink/6">
                    <Upload className="size-5 text-ink-2" />
                  </span>
                  <p className="text-sm font-medium">Drop a file here</p>
                  <p className="mt-1 text-xs text-ink-3">or</p>
                  <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => inputRef.current?.click()}>
                    Choose file
                  </Button>
                  <p className="mt-3 text-xs text-ink-3">PDF, EPUB, MP4, MP3, PPTX, ZIP · up to {fileSizeLabel(MAX_JSON_UPLOAD)}</p>
                </>
              )}
            </div>
            {fileError && <p role="alert" className="text-xs text-danger">{fileError}</p>}

            <InputField label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <TextAreaField label="Description" required minLength={10} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={[{ value: 'book', label: 'Book' }, { value: 'pdf', label: 'PDF guide' }, { value: 'video', label: 'Video' }, { value: 'template', label: 'Template' }, { value: 'audio', label: 'Audio' }, { value: 'presentation', label: 'Slides' }]} />
              <SelectField label="Attach to course" value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })} options={[{ value: '', label: 'Standalone' }, ...data.courses.map((c) => ({ value: c.id, label: c.title }))]} />
            </div>
            <div className="grid items-end gap-4 sm:grid-cols-2">
              <InputField label="Price (GHS)" type="number" min={0} disabled={f.free} value={f.free ? '0' : f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
              <Toggle label="Free" checked={f.free} onChange={(v) => setF({ ...f, free: v })} />
            </div>
            <Toggle label="Allow downloads" checked={f.download} onChange={(v) => setF({ ...f, download: v })} />

            {(uploading || progress > 0) && <ProgressBar value={progress} label={uploading ? 'Uploading…' : 'Uploaded'} />}
            {uploadError && (
              <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
                <span>{uploadError}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => upload()} icon={<RefreshCw className="size-4" />}>
                  Retry
                </Button>
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" loading={uploading} disabled={!file}>
              Publish resource
            </Button>
          </Card>
        </form>

        <section className="space-y-3 lg:col-span-7" aria-label="Your resources">
          <h2 className="display text-2xl">{data.resources.length} in your library</h2>
          {data.resources.length === 0 ? (
            <EmptyState title="Nothing uploaded yet" description="Your uploads will appear here." />
          ) : (
            data.resources.map((r) => (
              <Card key={r.id} padding="sm" className="flex items-center gap-4 p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky text-sky-ink">
                  <FileUp className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="truncate text-xs text-ink-3">
                    {r.file_name} · {fileSizeLabel(r.file_size_bytes)}
                    {r.course_title ? ` · ${r.course_title}` : ''}
                  </p>
                </div>
                <Badge tone={r.is_free ? 'sage' : 'neutral'}>{r.is_free ? 'Free' : formatCurrency(r.price_ghs, r.currency)}</Badge>
              </Card>
            ))
          )}
        </section>
      </div>
    </div>
  );
};

/* ============================================================================
   LIVE CLASSES
   ============================================================================ */
export const InstructorLiveManagerPage: React.FC = () => {
  const { notify } = useApp();
  const { data, loading, error, reload } = useOverview();
  const [open, setOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LiveSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [form, setForm] = useState(() => {
    const start = new Date(Date.now() + 3600 * 1000);
    start.setMinutes(0, 0, 0);
    return {
      courseId: '',
      title: '',
      description: '',
      start: toLocalInputValue(start),
      end: toLocalInputValue(new Date(start.getTime() + 3600 * 1000)),
      isPublic: false,
      record: false,
    };
  });
  const [formError, setFormError] = useState<string | undefined>();

  const schedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(undefined);
    const start = new Date(form.start);
    const end = new Date(form.end);
    if (!(end > start)) {
      setFormError('The end time must be after the start time.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/api/instructor/live-sessions', {
        method: 'POST',
        body: JSON.stringify({
          course_id: form.courseId || data?.courses[0]?.id,
          title: form.title,
          description: form.description,
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
          is_public: form.isPublic,
          recording_enabled: form.record,
        }),
      });
      notify({ type: 'success', title: 'Class scheduled', message: form.title });
      setOpen(false);
      setForm((p) => ({ ...p, title: '', description: '' }));
      await reload();
    } catch (err) {
      notify({ type: 'error', title: "Couldn't schedule", message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await apiRequest(`/api/livekit/sessions/${cancelTarget.id}/state`, { method: 'POST', body: JSON.stringify({ status: 'canceled' }) });
      notify({ type: 'info', title: 'Class canceled' });
      setCancelTarget(null);
      await reload();
    } catch (err) {
      notify({ type: 'error', title: "Couldn't cancel", message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error || 'Nothing to show.'} onRetry={reload} />;

  const upcoming = data.liveSessions.filter((s) => s.status === 'live' || s.status === 'scheduled');
  const past = data.liveSessions.filter((s) => s.status === 'ended' || s.status === 'canceled');
  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Live classes"
        description={`Times are in your local time zone (${timeZoneLabel}).`}
        actions={<Button onClick={() => setOpen(true)} icon={<CalendarPlus className="size-4" />} disabled={data.courses.length === 0}>Schedule class</Button>}
      />
      <Tabs id="live-mgr-tab" value={tab} onChange={setTab} label="Sessions" items={[{ id: 'upcoming', label: 'Upcoming', count: upcoming.length }, { id: 'past', label: 'Past', count: past.length }]} />

      {list.length === 0 ? (
        <EmptyState title={tab === 'upcoming' ? 'No classes scheduled' : 'No past classes'} icon={<Video className="size-6" />} />
      ) : (
        <div className="space-y-3">
          {list.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              action={
                s.status === 'ended' || s.status === 'canceled' ? (
                  <Badge tone={s.status === 'canceled' ? 'danger' : 'neutral'} className="capitalize">{s.status}</Badge>
                ) : (
                  <div className="flex gap-2">
                    {s.status === 'scheduled' && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelTarget(s)}>Cancel</Button>
                    )}
                    <LinkButton to={`/classroom/${s.id}`} size="sm" variant={s.status === 'live' ? 'accent' : 'primary'} icon={<Radio className="size-4" />}>
                      {s.status === 'live' ? 'Enter room' : 'Start'}
                    </LinkButton>
                  </div>
                )
              }
            />
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Schedule a class" description={`Students enrolled in the course can join. Times in ${timeZoneLabel}.`}>
        <form onSubmit={schedule} className="space-y-5">
          <SelectField label="Course" value={form.courseId || data.courses[0]?.id || ''} onChange={(e) => setForm({ ...form, courseId: e.target.value })} options={data.courses.map((c) => ({ value: c.id, label: c.title }))} />
          <InputField label="Title" required data-autofocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} minLength={4} />
          <TextAreaField label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <InputField label="Starts" type="datetime-local" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            <InputField label="Ends" type="datetime-local" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} error={formError} />
          </div>
          <Toggle label="Open to all signed-in learners" description="Skip the enrolment check for this class." checked={form.isPublic} onChange={(v) => setForm({ ...form, isPublic: v })} />
          <Toggle label="Allow recording" description="Lets you start a server-side recording. Requires LiveKit Egress." checked={form.record} onChange={(v) => setForm({ ...form, record: v })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Schedule</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel this class?"
        description={cancelTarget?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={cancel}>Cancel class</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Learners will no longer be able to join. This can't be undone.</p>
      </Modal>
    </div>
  );
};

/* ============================================================================
   STUDENTS, GRADING, ANNOUNCEMENTS
   ============================================================================ */
export const InstructorStudentsPage: React.FC = () => {
  const { notify } = useApp();
  const { data, loading, error, reload } = useOverview();
  const [tab, setTab] = useState<'students' | 'submissions' | 'announce'>('students');
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [grade, setGrade] = useState<Record<string, { score: string; feedback: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [ann, setAnn] = useState({ courseId: '', title: '', body: '' });

  const students = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data?.enrolledStudents ?? []).filter(
      (x) =>
        (courseFilter === 'all' || x.course_id === courseFilter) &&
        (!s || x.student_name.toLowerCase().includes(s) || x.student_email.toLowerCase().includes(s))
    );
  }, [data, search, courseFilter]);

  const saveGrade = async (id: string, max: number) => {
    const g = grade[id];
    const score = Number(g?.score);
    if (!g || g.score === '' || Number.isNaN(score) || score < 0 || score > max || !g.feedback.trim()) {
      notify({ type: 'error', title: 'Add a score and feedback', message: `Score must be between 0 and ${max}.` });
      return;
    }
    setBusy(id);
    try {
      await apiRequest(`/api/instructor/submissions/${id}/grade`, {
        method: 'POST',
        body: JSON.stringify({ score, feedback: g.feedback.trim(), status: 'graded' }),
      });
      notify({ type: 'success', title: 'Grade saved' });
      await reload();
    } catch (err) {
      notify({ type: 'error', title: "Couldn't save grade", message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('announce');
    try {
      await apiRequest('/api/instructor/announcements', {
        method: 'POST',
        body: JSON.stringify({ course_id: ann.courseId || data?.courses[0]?.id, title: ann.title, body: ann.body }),
      });
      notify({ type: 'success', title: 'Announcement published' });
      setAnn((p) => ({ ...p, title: '', body: '' }));
    } catch (err) {
      notify({ type: 'error', title: "Couldn't publish", message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error || 'Nothing to show.'} onRetry={reload} />;

  const pendingCount = data.submissions.filter((s) => s.status !== 'graded').length;

  return (
    <div className="space-y-8">
      <PageHeader title="Students" description="Track progress, grade work and keep your classes informed." />
      <Tabs
        id="students-tab"
        value={tab}
        onChange={setTab}
        label="Student tools"
        items={[
          { id: 'students', label: 'Students', count: data.enrolledStudents.length },
          { id: 'submissions', label: 'Submissions', count: pendingCount },
          { id: 'announce', label: 'Announcements' },
        ]}
      />

      {tab === 'students' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <InputField wrapperClassName="sm:w-80" type="search" aria-label="Search students" placeholder="Search students" value={search} onChange={(e) => setSearch(e.target.value)} leading={<Search className="size-4" />} />
            <SelectField aria-label="Filter by course" wrapperClassName="sm:w-72" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} options={[{ value: 'all', label: 'All courses' }, ...data.courses.map((c) => ({ value: c.id, label: c.title }))]} />
          </div>
          {students.length === 0 ? (
            <EmptyState title="No students found" icon={<Users className="size-6" />} />
          ) : (
            <Card padding="none" className="overflow-x-auto">
              <table className="table-clean">
                <thead>
                  <tr><th>Student</th><th>Course</th><th className="w-64">Progress</th><th>Enrolled</th></tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.enrollment_id}>
                      <td>
                        <p className="font-medium">{s.student_name}</p>
                        <p className="text-xs text-ink-3">{s.student_email}</p>
                      </td>
                      <td className="text-ink-2">{s.course_title}</td>
                      <td>
                        <ProgressBar value={s.total_lessons ? (s.completed_lessons / s.total_lessons) * 100 : 0} label={`${s.completed_lessons}/${s.total_lessons} lessons`} showValue={false} />
                      </td>
                      <td className="whitespace-nowrap text-ink-3">{formatDate(s.enrolled_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {tab === 'submissions' &&
        (data.submissions.length === 0 ? (
          <EmptyState title="No submissions yet" description="Student assignment submissions will appear here." />
        ) : (
          <div className="space-y-5">
            {data.submissions.map((s) => {
              const g = grade[s.id] ?? { score: s.score != null ? String(s.score) : '', feedback: s.feedback ?? '' };
              return (
                <Card key={s.id} className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-ink-3">{s.course_title} · {formatDateTime(s.submitted_at)}</p>
                      <p className="mt-1 font-medium">{s.student_name}: {s.assignment_title}</p>
                    </div>
                    <Badge tone={s.status === 'graded' ? 'success' : 'warn'} dot className="capitalize">{s.status.replace('_', ' ')}</Badge>
                  </div>
                  <p className="whitespace-pre-line rounded-2xl bg-canvas p-4 text-sm leading-relaxed text-ink-2">{s.submission_text}</p>
                  <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                    <InputField label={`Score / ${s.max_score}`} type="number" min={0} max={s.max_score} value={g.score} onChange={(e) => setGrade((p) => ({ ...p, [s.id]: { ...g, score: e.target.value } }))} />
                    <InputField label="Feedback" value={g.feedback} onChange={(e) => setGrade((p) => ({ ...p, [s.id]: { ...g, feedback: e.target.value } }))} placeholder="What worked, and what to improve" />
                  </div>
                  <Button size="sm" loading={busy === s.id} onClick={() => saveGrade(s.id, s.max_score)} icon={<CheckCircle2 className="size-4" />}>
                    {s.status === 'graded' ? 'Update grade' : 'Save grade'}
                  </Button>
                </Card>
              );
            })}
          </div>
        ))}

      {tab === 'announce' && (
        <form onSubmit={post} className="max-w-2xl">
          <Card className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Megaphone className="size-5" /></span>
              <p className="text-sm text-ink-3">Announcements appear on the dashboard of every student in the course.</p>
            </div>
            <SelectField label="Course" value={ann.courseId || data.courses[0]?.id || ''} onChange={(e) => setAnn({ ...ann, courseId: e.target.value })} options={data.courses.map((c) => ({ value: c.id, label: c.title }))} />
            <InputField label="Headline" required minLength={3} value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} />
            <TextAreaField label="Message" required minLength={5} rows={5} value={ann.body} onChange={(e) => setAnn({ ...ann, body: e.target.value })} />
            <Button type="submit" loading={busy === 'announce'} disabled={data.courses.length === 0}>Publish announcement</Button>
          </Card>
        </form>
      )}
    </div>
  );
};

export { Chip, Skeleton };
