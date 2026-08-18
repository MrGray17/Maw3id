import express from 'express';

import { createDoctorSearchController } from '../search/doctorSearchController.js';

export function createDoctorRouter({ searchService }) {
  const router = express.Router();
  const controller = createDoctorSearchController({ searchService });

  router.get('/doctors/nearby', controller.nearby);
  return router;
}
