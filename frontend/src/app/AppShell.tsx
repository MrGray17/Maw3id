import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Aller au contenu</a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" to="/" aria-label="Maw3id, accueil">
            <span className="brand-mark" aria-hidden="true">+</span><span>Maw3id</span>
          </Link>
          <nav className="site-nav" aria-label="Navigation principale">
            <a href="#fonctionnement">Comment ça marche</a>
            <span className="site-nav__future" aria-label="Espace patient bientôt disponible">Espace patient</span>
          </nav>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div><strong>Maw3id</strong><p>La file d’attente médicale, rendue visible.</p></div>
          <p>Les temps affichés sont des estimations et ne remplacent pas une urgence médicale.</p>
        </div>
      </footer>
    </div>
  );
}
