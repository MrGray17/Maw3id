import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneSignInPage } from './PhoneSignInPage';
import { requestPhoneCode, verifyPhoneCode } from './authApi';

vi.mock('./authApi', () => ({ requestPhoneCode: vi.fn(), verifyPhoneCode: vi.fn() }));
const requestMock = vi.mocked(requestPhoneCode);
const verifyMock = vi.mocked(verifyPhoneCode);
const challengeId = '0198c09c-0946-71b7-9c7a-43c2888cb87b';

describe('PhoneSignInPage', () => {
  beforeEach(() => { requestMock.mockReset(); verifyMock.mockReset(); });

  it('requests a code, renders the verification step, and verifies six digits', async () => {
    requestMock.mockResolvedValue({ data: { challengeId, expiresAt: '2026-08-18T15:05:00Z', resendAvailableAt: '2026-08-18T15:01:00Z', developmentCode: '123456' }, meta: {} });
    verifyMock.mockResolvedValue({ data: { user: { id: challengeId, role: 'patient', fullName: 'Patient Maw3id' }, csrfToken: 'a'.repeat(43) }, meta: {} });
    render(<MemoryRouter><PhoneSignInPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Numéro mobile marocain'), { target: { value: '06 12 34 56 78' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir mon code' }));
    expect(await screen.findByText(/Code local/)).toHaveTextContent('123456');
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Me connecter' }));
    await waitFor(() => expect(verifyMock).toHaveBeenCalledWith(challengeId, '06 12 34 56 78', '123456'));
  });
});
