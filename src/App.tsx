import { useEffect } from 'react';
import { Route, Routes, useLocation, Link } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Compare } from './pages/Compare';
import { Fixtures } from './pages/Fixtures';
import { MatchDetail } from './pages/MatchDetail';
import { Ratings } from './pages/Ratings';
import { Team } from './pages/Team';
import { Players } from './pages/Players';
import { Lineups } from './pages/Lineups';
import { Tactics } from './pages/Tactics';
import { Insights } from './pages/Insights';
import { Model } from './pages/Model';
import { Data } from './pages/Data';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="not-found">
      <div className="eyebrow">404 · off target</div>
      <h1 className="page-title">This page is out of play.</h1>
      <p className="page-sub">The route does not exist. Head back to the model board.</p>
      <Link to="/overview" className="btn btn--primary">Return to overview</Link>
    </div>
  );
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<Shell />}>
          <Route path="overview" element={<Dashboard />} />
          <Route path="fixtures" element={<Fixtures />} />
          <Route path="matches/:id" element={<MatchDetail />} />
          <Route path="ratings" element={<Ratings />} />
          <Route path="teams/:id" element={<Team />} />
          <Route path="players" element={<Players />} />
          <Route path="compare" element={<Compare />} />
          <Route path="lineups" element={<Lineups />} />
          <Route path="tactics" element={<Tactics />} />
          <Route path="insights" element={<Insights />} />
          <Route path="model" element={<Model />} />
          <Route path="data" element={<Data />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
