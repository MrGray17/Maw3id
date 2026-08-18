import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/httpClient';
import { AppShell } from '../../app/AppShell';
import { requestPhoneCode, verifyPhoneCode } from './authApi';

type Challenge = Awaited<ReturnType<typeof requestPhoneCode>>['data'];

export function PhoneSignInPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { setChallenge((await requestPhoneCode(phone.trim())).data); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Impossible d’envoyer le code. Réessayez.'); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault(); if (!challenge) return; setBusy(true); setError(null);
    try { await verifyPhoneCode(challenge.challengeId, phone.trim(), code); navigate('/espace-patient', { replace: true }); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Le code n’a pas pu être vérifié.'); }
    finally { setBusy(false); }
  }

  return <AppShell><main id="main-content" className="auth-page"><section className="auth-card" aria-labelledby="auth-title">
    <span className="eyebrow">Espace patient</span><h1 id="auth-title">{challenge ? 'Entrez votre code' : 'Connexion par téléphone'}</h1>
    {!challenge ? <form onSubmit={request}>
      <p>Nous vous envoyons un code à usage unique. Aucun mot de passe à retenir.</p>
      <div className="form-field"><label htmlFor="phone">Numéro mobile marocain</label><input id="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="06 12 34 56 78" value={phone} onChange={(event) => setPhone(event.target.value)} required /></div>
      {error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary auth-submit" disabled={busy}>{busy ? 'Envoi…' : 'Recevoir mon code'}</button>
    </form> : <form onSubmit={verify}>
      <p>Code envoyé au <strong>{phone}</strong>. Il expire dans cinq minutes.</p>
      {challenge.developmentCode && <p className="development-code">Code local : <strong>{challenge.developmentCode}</strong></p>}
      <div className="form-field"><label htmlFor="code">Code à 6 chiffres</label><input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required /></div>
      {error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary auth-submit" disabled={busy || code.length !== 6}>{busy ? 'Vérification…' : 'Me connecter'}</button>
      <button className="auth-back" type="button" onClick={() => { setChallenge(null); setCode(''); setError(null); }}>Modifier le numéro</button>
    </form>}
    <p className="auth-privacy">Votre numéro sert uniquement à sécuriser votre compte. <Link to="/">Retour à la recherche</Link></p>
  </section></main></AppShell>;
}
