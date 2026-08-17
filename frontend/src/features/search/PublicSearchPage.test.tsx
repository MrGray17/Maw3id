import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicSearchPage } from './PublicSearchPage';
import { searchDoctors } from './searchApi';

vi.mock('./searchApi', () => ({ searchDoctors: vi.fn() }));
const searchDoctorsMock = vi.mocked(searchDoctors);

function renderPage() {
  return render(<MemoryRouter><PublicSearchPage /></MemoryRouter>);
}

describe('PublicSearchPage', () => {
  beforeEach(() => searchDoctorsMock.mockReset());

  it('requires a specialty and location before calling the API', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les médecins disponibles' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez une spécialité.');
    expect(searchDoctorsMock).not.toHaveBeenCalled();
  });

  it('submits normalized search criteria and renders an empty state', async () => {
    searchDoctorsMock.mockResolvedValue({
      data: [],
      meta: { generatedAt: '2026-08-17T10:00:00.000Z' },
    });
    renderPage();

    fireEvent.change(screen.getByLabelText('Spécialité'), { target: { value: 'Cardiologie' } });
    fireEvent.change(screen.getByLabelText('Ville ou quartier'), { target: { value: '  Rabat  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Voir les médecins disponibles' }));

    await waitFor(() => expect(searchDoctorsMock).toHaveBeenCalledWith({
      specialty: 'Cardiologie',
      city: 'Rabat',
      latitude: undefined,
      longitude: undefined,
      acceptingOnly: true,
    }, expect.any(AbortSignal)));
    expect(await screen.findByText('Aucun résultat pour ces critères')).toBeInTheDocument();
  });
});
