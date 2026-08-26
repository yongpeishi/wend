import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './ErrorBoundary';
import { AdminFeedback } from './routes/AdminFeedback';
import { AdminLayout } from './routes/AdminLayout';
import { AppLayout } from './routes/AppLayout';
import { SignIn } from './routes/SignIn';
import { TripsList } from './routes/TripsList';
import { TripLayout } from './routes/TripLayout';
import { TripBoard } from './routes/TripBoard';
import { TripItinerary } from './routes/TripItinerary';
import { TripMap } from './routes/TripMap';
import { TripSchedule } from './routes/TripSchedule';
import { TripChecklist } from './routes/TripChecklist';
import { Library } from './routes/Library';
import { EntryDetail } from './routes/EntryDetail';
import { NotFound } from './routes/NotFound';
import { DesignGallery } from './routes/DesignGallery';

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/signin" element={<SignIn />} />
                <Route path="/design" element={<DesignGallery />} />

                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<TripsList />} />
                    <Route path="/library" element={<Library />} />
                    <Route path="/trips/:id" element={<TripLayout />}>
                      <Route index element={<TripBoard />} />
                      <Route path="itinerary" element={<TripItinerary />} />
                      <Route path="map" element={<TripMap />} />
                      <Route path="schedule" element={<TripSchedule />} />
                      <Route path="checklist" element={<TripChecklist />} />
                    </Route>
                    <Route path="/entries/:id" element={<EntryDetail />} />
                  </Route>

                  {/* The admin area: its own shell, not a screen inside
                      AppLayout — the recoloured chrome is the cue that you have
                      left the app. AdminLayout itself turns non-admins back. */}
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<Navigate to="/admin/feedback" replace />} />
                    <Route path="feedback" element={<AdminFeedback />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
