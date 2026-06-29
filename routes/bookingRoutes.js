import express from 'express';

import { getAllSlots, createBooking } from '../controllers/bookingController.js';

const router = express.Router();

router.get('/slots', getAllSlots);
router.post('/bookings', createBooking);

export default router;