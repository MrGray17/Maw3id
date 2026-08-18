import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { PublicSearchPage } from '../features/search/PublicSearchPage';
import { PatientSpacePage } from '../features/auth/PatientSpacePage';
import { PhoneSignInPage } from '../features/auth/PhoneSignInPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicSearchPage />} />
        <Route path="/connexion" element={<PhoneSignInPage />} />
        <Route path="/espace-patient" element={<PatientSpacePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
