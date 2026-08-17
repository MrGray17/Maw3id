import { lazy, Suspense } from 'react';
import { runtimeConfig } from '../../config/runtimeConfig';
import type { DoctorSearchResult, QueueStatus } from './doctorSchemas';

const InteractiveDoctorMap = lazy(() => import('./InteractiveDoctorMap'));
const LEGEND: Array<{ status: QueueStatus; label: string }> = [
  { status: 'available', label: 'Disponible' }, { status: 'moderate', label: 'Modéré' },
  { status: 'busy', label: 'Chargé' }, { status: 'full', label: 'Complet' },
  { status: 'unknown', label: 'Inconnu' },
];

interface Props {
  doctors: DoctorSearchResult[];
  phase: 'idle' | 'loading' | 'success' | 'error';
  selectedDoctorId: string | null;
  onSelect: (doctorId: string) => void;
}

export function DoctorMapPanel({ doctors, phase, selectedDoctorId, onSelect }: Props) {
  let content;
  if (phase === 'idle') {
    content = <div className="map-state"><span className="map-state__icon" aria-hidden="true">⌖</span><strong>Votre recherche apparaîtra ici</strong><p>Choisissez une spécialité et une ville, ou autorisez votre position.</p></div>;
  } else if (phase === 'loading') {
    content = <div className="map-skeleton" aria-label="Chargement de la carte" />;
  } else if (doctors.length === 0) {
    content = <div className="map-state"><span className="map-state__icon" aria-hidden="true">○</span><strong>Aucun cabinet trouvé</strong><p>Élargissez la zone ou essayez une autre spécialité.</p></div>;
  } else if (!runtimeConfig.mapStyleUrl) {
    content = <div className="map-state" role="status"><span className="map-state__icon" aria-hidden="true">◇</span><strong>Liste disponible, fond de carte non configuré</strong><p>Les cabinets restent consultables dans la liste. Aucun faux fond de carte n’est affiché.</p></div>;
  } else {
    content = <Suspense fallback={<div className="map-skeleton" aria-label="Chargement de la carte" />}><InteractiveDoctorMap doctors={doctors} mapStyleUrl={runtimeConfig.mapStyleUrl} selectedDoctorId={selectedDoctorId} onSelect={onSelect} /></Suspense>;
  }

  return (
    <section className="map-panel" aria-label="Carte des cabinets">
      <div className="map-panel__content">{content}</div>
      <div className="map-legend" aria-label="Légende de l’état des files">
        {LEGEND.map((item) => <span key={item.status}><i className={`status-dot status-dot--${item.status}`} aria-hidden="true" />{item.label}</span>)}
      </div>
    </section>
  );
}
