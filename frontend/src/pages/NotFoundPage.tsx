import { Link } from 'react-router-dom';
import { AppShell } from '../app/AppShell';

export function NotFoundPage() {
  return (
    <AppShell>
      <main id="main-content" className="not-found">
        <span className="eyebrow">Erreur 404</span>
        <h1>Cette page n’existe pas</h1>
        <p>Le lien est peut-être ancien ou incorrect.</p>
        <Link className="button button--primary" to="/">Retour à la recherche</Link>
      </main>
    </AppShell>
  );
}
