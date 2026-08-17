import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { DoctorSearchResult } from './doctorSchemas';

interface Props {
  doctors: DoctorSearchResult[];
  mapStyleUrl: string;
  selectedDoctorId: string | null;
  onSelect: (doctorId: string) => void;
}

export default function InteractiveDoctorMap({ doctors, mapStyleUrl, selectedDoctorId, onSelect }: Props) {
  const firstDoctor = doctors[0];
  if (!firstDoctor) return null;

  return (
    <Map
      initialViewState={{ longitude: firstDoctor.cabinet.longitude, latitude: firstDoctor.cabinet.latitude, zoom: 12 }}
      mapStyle={mapStyleUrl}
      attributionControl={{ compact: true }}
      reuseMaps
    >
      <NavigationControl position="top-right" showCompass={false} />
      {doctors.map((doctor) => (
        <Marker key={doctor.id} longitude={doctor.cabinet.longitude} latitude={doctor.cabinet.latitude} anchor="bottom">
          <button
            className={`map-marker map-marker--${doctor.queueStatus}${selectedDoctorId === doctor.id ? ' map-marker--selected' : ''}`}
            type="button"
            onClick={() => onSelect(doctor.id)}
            aria-label={`Afficher ${doctor.displayName}`}
            aria-pressed={selectedDoctorId === doctor.id}
          ><span aria-hidden="true">+</span></button>
        </Marker>
      ))}
    </Map>
  );
}
