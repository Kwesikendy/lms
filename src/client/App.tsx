import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext.js';
import { AppLayout } from './components/layout/AppLayout.js';
import {
  HomePage,
  CourseCatalogPage,
  CourseDetailPage,
  ResourceCatalogPage,
} from './pages/public/PublicPages.js';
import {
  AuthPage,
  CheckoutPage,
  CheckoutResultPage,
} from './pages/public/AuthAndCheckoutPages.js';
import {
  StudentDashboardPage,
  MyLearningPage,
  LearningWorkspacePage,
  MyLibraryPage,
  StudentLiveClassesPage,
  AssessmentsPage,
  StudentAccountPage,
} from './pages/student/StudentPages.js';
import { PageSkeleton } from './components/ui/index.js';
import type { UserRole } from '../shared/types.js';

// Lazy-load heavier role portals and the WebRTC LiveKit classroom for optimal bundle splitting
const LiveClassroomPage = lazy(() =>
  import('./pages/classroom/LiveClassroomPage.js').then((m) => ({
    default: m.LiveClassroomPage,
  }))
);
const InstructorDashboardPage = lazy(() =>
  import('./pages/instructor/InstructorPages.js').then((m) => ({
    default: m.InstructorDashboardPage,
  }))
);
const InstructorCourseEditorPage = lazy(() =>
  import('./pages/instructor/InstructorPages.js').then((m) => ({
    default: m.InstructorCourseEditorPage,
  }))
);
const InstructorResourceManagerPage = lazy(() =>
  import('./pages/instructor/InstructorPages.js').then((m) => ({
    default: m.InstructorResourceManagerPage,
  }))
);
const InstructorLiveManagerPage = lazy(() =>
  import('./pages/instructor/InstructorPages.js').then((m) => ({
    default: m.InstructorLiveManagerPage,
  }))
);
const InstructorStudentsPage = lazy(() =>
  import('./pages/instructor/InstructorPages.js').then((m) => ({
    default: m.InstructorStudentsPage,
  }))
);
const AdminDashboardPage = lazy(() =>
  import('./pages/admin/AdminPages.js').then((m) => ({
    default: m.AdminDashboardPage,
  }))
);

const ProtectedRoute: React.FC<{
  roles?: UserRole[];
  children: React.ReactNode;
}> = ({ roles, children }) => {
  const { user, loadingAuth } = useApp();

  if (loadingAuth) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <PageSkeleton />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/student/dashboard" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppLayout>
          <Suspense
            fallback={
              <div className="p-8 max-w-6xl mx-auto">
                <PageSkeleton />
              </div>
            }
          >
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/courses" element={<CourseCatalogPage />} />
              <Route path="/courses/:slugOrId" element={<CourseDetailPage />} />
              <Route path="/resources" element={<ResourceCatalogPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/checkout/result" element={<CheckoutResultPage />} />

              {/* Student Portal Routes */}
              <Route
                path="/student/dashboard"
                element={
                  <ProtectedRoute>
                    <StudentDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/learning"
                element={
                  <ProtectedRoute>
                    <MyLearningPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/workspace/:courseId"
                element={
                  <ProtectedRoute>
                    <LearningWorkspacePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/library"
                element={
                  <ProtectedRoute>
                    <MyLibraryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/live"
                element={
                  <ProtectedRoute>
                    <StudentLiveClassesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/assessments"
                element={
                  <ProtectedRoute>
                    <AssessmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/account"
                element={
                  <ProtectedRoute>
                    <StudentAccountPage />
                  </ProtectedRoute>
                }
              />

              {/* Dedicated LiveKit Classroom */}
              <Route
                path="/classroom/:sessionId"
                element={
                  <ProtectedRoute>
                    <LiveClassroomPage />
                  </ProtectedRoute>
                }
              />

              {/* Instructor Portal Routes */}
              <Route
                path="/instructor/dashboard"
                element={
                  <ProtectedRoute roles={['instructor', 'admin']}>
                    <InstructorDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/instructor/courses"
                element={
                  <ProtectedRoute roles={['instructor', 'admin']}>
                    <InstructorCourseEditorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/instructor/resources"
                element={
                  <ProtectedRoute roles={['instructor', 'admin']}>
                    <InstructorResourceManagerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/instructor/live"
                element={
                  <ProtectedRoute roles={['instructor', 'admin']}>
                    <InstructorLiveManagerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/instructor/students"
                element={
                  <ProtectedRoute roles={['instructor', 'admin']}>
                    <InstructorStudentsPage />
                  </ProtectedRoute>
                }
              />

              {/* Administrator Portal Routes */}
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <AdminDashboardPage />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppLayout>
      </AppProvider>
    </BrowserRouter>
  );
};
