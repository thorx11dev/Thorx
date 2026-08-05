import { useState, useEffect, lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { WsStatusBanner } from "@/components/ui/WsStatusBanner";
import { ProtectedRoute, PublicOnlyRoute, TeamProtectedRoute } from "@/components/auth/ProtectedRoute";
import ThorxLoadingScreen from "@/components/ui/thorx-loading-screen";
import ComicClickEffect from "@/components/ui/ComicClickEffect";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Home = lazy(() => import("@/pages/home"));
const Auth = lazy(() => import("@/features/auth/AuthPage"));
const UserPortal = lazy(() => import("@/features/user-portal/UserPortalPage"));
const TeamPortal = lazy(() => import("@/features/team-portal/TeamPortalPage"));
const HilltopAdsAdmin = lazy(() => import("@/pages/HilltopAdsAdmin"));
const TermsAndConditions = lazy(() => import("@/features/legal/TermsPage"));
const PrivacyPolicy = lazy(() => import("@/features/legal/PrivacyPage"));
const AdLanding = lazy(() => import("@/pages/AdLanding"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const NotFound = lazy(() => import("@/pages/not-found"));
const DevReferralPreview = lazy(() => import("@/pages/_dev-referral-preview"));

function PageLoader() {
  return <ThorxLoadingScreen message="LOADING MODULE" duration={800} />;
}

function Router() {
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);

  // Real-time sync: pushes admin-side changes (balance, rank, status) to this
  // session instantly so the portal never shows stale data.
  const { wsConnected } = useRealtimeSync(isAuthenticated ? user : null, user?.guildId);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        setShowLoadingScreen(false);
      }, 300); // Reduced delay for faster UX
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Skip loading screen specifically for auth page
  const isAuthPage = location === "/auth";

  if ((isLoading || showLoadingScreen) && !isAuthPage) {
    return <ThorxLoadingScreen message="INITIALIZING THORX SYSTEM" duration={300} />;
  }

  const getPortalComponent = () => {
    if (!isAuthenticated) return <Home />;

    if (user?.role === 'team' || user?.role === 'founder' || user?.role === 'admin') {
      return (
        <ErrorBoundary scope="Admin Portal">
          <TeamPortal />
        </ErrorBoundary>
      );
    } else {
      return (
        <ErrorBoundary scope="User Portal">
          <UserPortal />
        </ErrorBoundary>
      );
    }
  };

  return (
    <Suspense fallback={<PageLoader />}>
      {isAuthenticated && <WsStatusBanner wsConnected={wsConnected} />}
      <Switch>
        <Route path="/">
          {getPortalComponent()}
        </Route>

        <Route path="/auth">
          <PublicOnlyRoute redirectTo="/">
            <Auth />
          </PublicOnlyRoute>
        </Route>

        <Route path="/reset-password">
          <ResetPassword />
        </Route>

        <Route path="/_dev-referral-preview">
          <DevReferralPreview />
        </Route>

        <Route path="/user-portal">
          <ProtectedRoute>
            <UserPortal />
          </ProtectedRoute>
        </Route>

        <Route path="/portal">
          <ProtectedRoute>
            <UserPortal />
          </ProtectedRoute>
        </Route>

        <Route path="/team-portal">
          <TeamProtectedRoute>
            <TeamPortal />
          </TeamProtectedRoute>
        </Route>

        <Route path="/team">
          <TeamProtectedRoute>
            <TeamPortal />
          </TeamProtectedRoute>
        </Route>

        <Route path="/dashboard">
          <ProtectedRoute>
            <UserPortal />
          </ProtectedRoute>
        </Route>

        <Route path="/work">
          <ProtectedRoute>
            <UserPortal />
          </ProtectedRoute>
        </Route>

        <Route path="/hilltopads">
          <TeamProtectedRoute>
            <HilltopAdsAdmin />
          </TeamProtectedRoute>
        </Route>

        <Route path="/terms">
          <TermsAndConditions />
        </Route>

        <Route path="/privacy">
          <PrivacyPolicy />
        </Route>

        <Route path="/ad-landing">
          <AdLanding />
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  }, [location]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ScrollToTop />
        <ComicClickEffect />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
