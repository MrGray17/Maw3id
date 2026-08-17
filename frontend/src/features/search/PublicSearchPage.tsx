import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/httpClient';
import { AppShell } from '../../app/AppShell';
import { DoctorCard } from './DoctorCard';
import { DoctorMapPanel } from './DoctorMapPanel';
import type { DoctorSearchResult } from './doctorSchemas';
import { searchDoctors } from './searchApi';

const SPECIALTIES = [
  'Médecine générale', 'Cardiologie', 'Dermatologie', 'Gynécologie',
  'Ophtalmologie', 'Oto-rhino-laryngologie', 'Pédiatrie', 'Psychiatrie',
];
type SearchPhase = 'idle' | 'loading' | 'success' | 'error';
interface Coordinates { latitude: number; longitude: number }

export function PublicSearchPage() {
  const [specialty, setSpecialty] = useState('');
  const [city, setCity] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [acceptingOnly, setAcceptingOnly] = useState(true);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [results, setResults] = useState<DoctorSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  function useMyLocation() {
    setFormError(null);
    setLocationMessage(null);
    if (!navigator.geolocation) {
      setLocationMessage('La géolocalisation n’est pas disponible. Saisissez une ville.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setCity('');
        setLocationMessage('Position utilisée uniquement pour cette recherche.');
        setLocating(false);
      },
      () => {
        setCoordinates(null);
        setLocationMessage('Position refusée ou indisponible. Saisissez une ville à la place.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 5 * 60_000 },
    );
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSearchError(null);
    if (!specialty) { setFormError('Choisissez une spécialité.'); return; }
    if (!coordinates && city.trim().length < 2) {
      setFormError('Saisissez une ville ou utilisez votre position.');
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setPhase('loading');

    try {
      const response = await searchDoctors({
        specialty,
        city: coordinates ? undefined : city.trim(),
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        acceptingOnly,
      }, controller.signal);
      if (controller.signal.aborted) return;
      setResults(response.data);
      setSelectedDoctorId(response.data[0]?.id ?? null);
      setPhase('success');
    } catch (error) {
      if (controller.signal.aborted) return;
      setResults([]);
      setSelectedDoctorId(null);
      setPhase('error');
      setSearchError(error instanceof ApiError ? error.message : 'Une erreur inattendue a empêché la recherche.');
    }
  }

  return (
    <AppShell>
      <main id="main-content">
        <section className="hero-section">
          <div className="hero-section__copy">
            <span className="eyebrow">Files d’attente visibles en temps réel</span>
            <h1>Moins d’attente.<br />Plus de choix.</h1>
            <p>Trouvez un médecin près de chez vous, comparez l’état des files et choisissez le bon moment pour vous déplacer.</p>
          </div>

          <form className="search-card" onSubmit={submitSearch} noValidate>
            <div className="search-card__heading">
              <div><span className="search-card__step">Recherche actuelle</span><h2>Trouver un cabinet</h2></div>
              <span className="live-indicator"><i aria-hidden="true" /> Données fraîches</span>
            </div>
            <div className="form-field">
              <label htmlFor="specialty">Spécialité</label>
              <select id="specialty" value={specialty} onChange={(event) => setSpecialty(event.target.value)}>
                <option value="">Choisir une spécialité</option>
                {SPECIALTIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="city">Ville ou quartier</label>
              <div className="location-field">
                <input
                  id="city"
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value);
                    setCoordinates(null);
                    setLocationMessage(null);
                  }}
                  placeholder="Ex. Kénitra, Agdal…"
                  autoComplete="address-level2"
                />
                <button className="location-button" type="button" onClick={useMyLocation} disabled={locating}>
                  {locating ? 'Localisation…' : 'Ma position'}
                </button>
              </div>
              {locationMessage && <p className="field-message" role="status">{locationMessage}</p>}
            </div>
            <label className="checkbox-field">
              <input type="checkbox" checked={acceptingOnly} onChange={(event) => setAcceptingOnly(event.target.checked)} />
              <span>Afficher uniquement les cabinets qui acceptent de nouveaux tickets</span>
            </label>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <button className="button button--primary search-button" type="submit" disabled={phase === 'loading'}>
              {phase === 'loading' ? 'Recherche en cours…' : 'Voir les médecins disponibles'}
            </button>
          </form>
        </section>

        <section className="search-results" aria-labelledby="results-title">
          <div className="section-heading">
            <div><span className="eyebrow">Autour de vous</span><h2 id="results-title">{phase === 'success' ? `${results.length} cabinet${results.length === 1 ? '' : 's'} trouvé${results.length === 1 ? '' : 's'}` : 'Médecins à proximité'}</h2></div>
            <p>Les positions affichées sont celles des cabinets vérifiés, jamais celles des médecins.</p>
          </div>
          {searchError && <div className="notice notice--error" role="alert"><strong>La recherche n’a pas abouti</strong><span>{searchError}</span></div>}
          <div className="results-layout">
            <div className="doctor-list" aria-live="polite" aria-busy={phase === 'loading'}>
              {phase === 'loading' && Array.from({ length: 3 }, (_, index) => <div className="doctor-card doctor-card--skeleton" key={index} aria-hidden="true" />)}
              {phase === 'idle' && <div className="list-state"><strong>Commencez par une recherche</strong><p>Nous afficherons ici la distance, l’attente estimée et la fraîcheur de l’information.</p></div>}
              {phase === 'success' && results.length === 0 && <div className="list-state"><strong>Aucun résultat pour ces critères</strong><p>Essayez une ville voisine, désactivez le filtre ou choisissez une autre spécialité.</p></div>}
              {results.map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} selected={selectedDoctorId === doctor.id} onSelect={setSelectedDoctorId} />)}
            </div>
            <DoctorMapPanel doctors={results} phase={phase} selectedDoctorId={selectedDoctorId} onSelect={setSelectedDoctorId} />
          </div>
        </section>

        <section className="how-it-works" id="fonctionnement" aria-labelledby="how-title">
          <div className="section-heading section-heading--centered"><span className="eyebrow">Simple et transparent</span><h2 id="how-title">Avant de sortir, sachez à quoi vous attendre</h2></div>
          <ol className="steps-grid">
            <li><span>01</span><strong>Cherchez</strong><p>Choisissez une spécialité et une zone.</p></li>
            <li><span>02</span><strong>Comparez</strong><p>Consultez l’attente, la distance et la fraîcheur.</p></li>
            <li><span>03</span><strong>Prenez un ticket</strong><p>Rejoignez la file en ligne et suivez votre position.</p></li>
          </ol>
        </section>
      </main>
    </AppShell>
  );
}
