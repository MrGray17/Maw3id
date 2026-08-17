import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { PublicSearchPage } from '../features/search/PublicSearchPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicSearchPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
