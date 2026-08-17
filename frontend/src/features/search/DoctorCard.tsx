import type { DoctorSearchResult, QueueStatus } from './doctorSchemas';

const STATUS_LABELS: Record<QueueStatus, string> = {
  available: 'Disponible', moderate: 'Attente modérée', busy: 'Très demandé',
  full: 'Complet', paused: 'En pause', closed: 'Fermé', unknown: 'État inconnu',
};
const TIME_FORMATTER = new Intl.DateTimeFormat('fr-MA', { hour: '2-digit', minute: '2-digit' });

function distanceLabel(value: number | null) {
  if (value === null) return null;
  return value < 1000 ? `${Math.round(value / 50) * 50} m` : `${(value / 1000).toFixed(1).replace('.', ',')} km`;
}

function waitLabel(doctor: DoctorSearchResult) {
  if (!doctor.estimatedWaitMinutes) return 'Estimation indisponible';
  const { min, max } = doctor.estimatedWaitMinutes;
  return min === max ? `Environ ${max} min` : `Entre ${min} et ${max} min`;
}

export function DoctorCard({
  doctor, selected, onSelect,
}: {
  doctor: DoctorSearchResult;
  selected: boolean;
  onSelect: (doctorId: string) => void;
}) {
  const distance = distanceLabel(doctor.distanceMeters);
  const lastUpdatedLabel = TIME_FORMATTER.format(new Date(doctor.lastUpdatedAt));

  return (
    <article className={`doctor-card${selected ? ' doctor-card--selected' : ''}`}>
      <button className="doctor-card__select" type="button" onClick={() => onSelect(doctor.id)} aria-pressed={selected}>
        <span className={`status-dot status-dot--${doctor.queueStatus}`} aria-hidden="true" />
        <span className="doctor-card__identity"><strong>{doctor.displayName}</strong><span>{doctor.specialty}</span></span>
        {distance && <span className="doctor-card__distance">{distance}</span>}
      </button>
      <div className="doctor-card__details">
        <div><span className={`status-badge status-badge--${doctor.queueStatus}`}>{STATUS_LABELS[doctor.queueStatus]}</span><strong>{waitLabel(doctor)}</strong></div>
        <p>{doctor.cabinet.name}</p>
        <p>{doctor.cabinet.address}, {doctor.cabinet.city}</p>
        <small>Mis à jour à <time dateTime={doctor.lastUpdatedAt}>{lastUpdatedLabel}</time></small>
      </div>
    </article>
  );
}
