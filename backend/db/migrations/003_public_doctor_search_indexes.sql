CREATE INDEX IF NOT EXISTS doctors_specialty_lower_idx
  ON doctors (lower(specialty));

CREATE INDEX IF NOT EXISTS cabinets_city_lower_idx
  ON cabinets (lower(city));
