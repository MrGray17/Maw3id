import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/httpClient';
import { AppShell } from '../../app/AppShell';
import { getSession, logout } from './authApi';

type State = { phase: 'loading' | 'anonymous' | 'error' } | { phase: 'ready'; csrfToken: string };
export function PatientSpacePage() {
  const navigate = useNavigate(); const [state, setState] = useState<State>({ phase: 'loading' });
  useEffect(() => { getSession().then((response) => setState({ phase: 'ready', csrfToken: response.data.csrfToken })).catch((error) => setState(error instanceof ApiError && error.status === 401 ? { phase: 'anonymous' } : { phase: 'error' })); }, []);
  async function signOut() { if (state.phase === 'ready') { await logout(state.csrfToken); navigate('/', { replace: true }); } }
  return <AppShell><main id="main-content" className="auth-page"><section className="auth-card"><span className="eyebrow">Espace patient</span><h1>Votre espace Maw3id</h1>
    {state.phase === 'loading' && <p role="status">Chargement de votre session…</p>}
    {state.phase === 'anonymous' && <><p>Connectez-vous pour consulter et suivre vos tickets.</p><Link className="button button--primary" to="/connexion">Se connecter</Link></>}
    {state.phase === 'error' && <p className="form-error" role="alert">Impossible de charger votre session. Réessayez.</p>}
    {state.phase === 'ready' && <><p>Vous êtes connecté. Le suivi de vos tickets sera ajouté prochainement.</p><button className="button button--primary" onClick={signOut}>Se déconnecter</button></>}
  </section></main></AppShell>;
}
