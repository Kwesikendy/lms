import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BookOpen,
  Clock,
  FileText,
  Headphones,
  LayoutTemplate,
  Layers,
  Presentation,
  Video,
} from 'lucide-react';
import { Avatar, Badge, Card, Cover, cn } from './index.js';
import { formatCurrency, dateParts, timeRange } from '../../lib/api.js';
import type { Course, LearningResource, LiveSession } from '../../../shared/types.js';

export function CourseCard({
  course,
}: {
  course: Course & { has_access?: boolean };
}) {
  return (
    <Card interactive padding="none" className="group flex flex-col p-3">
      <Cover seed={course.slug} label={course.category_name} className="h-44" />
      <div className="flex flex-1 flex-col px-2 pb-2 pt-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-ink-3">
          <span>{course.level}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            {course.duration_hours}h
          </span>
          {course.lesson_count !== undefined && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Layers className="size-3.5" aria-hidden="true" />
                {course.lesson_count} lessons
              </span>
            </>
          )}
        </div>
        <h3 className="display text-[1.4rem] leading-snug">
          <Link
            to={`/courses/${course.slug}`}
            className="rounded after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none"
          >
            {course.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-ink-3">{course.subtitle || course.description}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
            <Avatar name={course.instructor_name ?? 'Instructor'} size={26} />
            <span className="truncate">{course.instructor_name}</span>
          </span>
          {course.has_access ? (
            <Badge tone="success" dot>
              Enrolled
            </Badge>
          ) : course.is_free ? (
            <Badge tone="sage">Free</Badge>
          ) : (
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(course.price_ghs, course.currency)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

const resourceTypes: Record<
  LearningResource['resource_type'],
  { icon: typeof FileText; tone: 'sky' | 'sage' | 'sand' | 'plum' | 'accent'; label: string }
> = {
  book: { icon: BookOpen, tone: 'sand', label: 'Book' },
  pdf: { icon: FileText, tone: 'sky', label: 'PDF guide' },
  video: { icon: Video, tone: 'plum', label: 'Video' },
  template: { icon: LayoutTemplate, tone: 'sage', label: 'Template' },
  audio: { icon: Headphones, tone: 'accent', label: 'Audio' },
  presentation: { icon: Presentation, tone: 'sky', label: 'Slides' },
};

const tileTone = {
  sky: 'bg-sky text-sky-ink',
  sage: 'bg-sage text-sage-ink',
  sand: 'bg-sand text-sand-ink',
  plum: 'bg-plum text-plum-ink',
  accent: 'bg-accent-soft text-accent-ink',
};

export function ResourceCard({
  resource,
  action,
}: {
  resource: LearningResource;
  action: React.ReactNode;
}) {
  const meta = resourceTypes[resource.resource_type] ?? resourceTypes.pdf;
  const Icon = meta.icon;
  return (
    <Card interactive className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className={cn('grid size-12 place-items-center rounded-2xl', tileTone[meta.tone])}>
          <Icon className="size-6" aria-hidden="true" />
        </div>
        {resource.has_access ? (
          <Badge tone="success" dot>
            {resource.is_free ? 'Free' : 'Unlocked'}
          </Badge>
        ) : (
          <span className="text-sm font-semibold tabular-nums">
            {formatCurrency(resource.price_ghs, resource.currency)}
          </span>
        )}
      </div>
      <p className="mt-5 text-xs text-ink-3">
        {meta.label}
        {resource.page_count ? ` · ${resource.page_count} pages` : ''}
      </p>
      <h3 className="display mt-1 text-[1.3rem] leading-snug">{resource.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-ink-3">{resource.description}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span className="truncate text-[13px] text-ink-3">{resource.author_name}</span>
        {action}
      </div>
    </Card>
  );
}

export function SessionRow({
  session,
  action,
  compact,
}: {
  session: LiveSession;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  const d = dateParts(session.scheduled_start_at);
  const live = session.status === 'live';
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-2xl border border-line bg-card transition-colors hover:border-line-strong',
        compact ? 'p-3' : 'p-4'
      )}
    >
      <div
        className={cn(
          'grid w-14 shrink-0 place-items-center rounded-xl py-2 text-center',
          live ? 'bg-accent text-on-accent' : 'bg-ink/6 text-ink'
        )}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{d.month}</span>
        <span className="text-xl font-semibold leading-none tabular-nums">{d.day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-2 text-xs font-medium text-accent-ink">
              <span className="live-dot" aria-hidden="true" /> Live now
            </span>
          ) : (
            <span className="text-xs text-ink-3">
              {d.weekday} · {timeRange(session.scheduled_start_at, session.scheduled_end_at)}
            </span>
          )}
          {session.is_public && <Badge tone="sky">Open to all</Badge>}
        </div>
        <p className="truncate font-medium">{session.title}</p>
        {session.course_title && <p className="truncate text-[13px] text-ink-3">{session.course_title}</p>}
      </div>
      {action}
    </div>
  );
}

export function ArrowLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-accent-ink"
    >
      {children}
      <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}
