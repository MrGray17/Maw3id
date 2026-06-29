import express from 'express';

import bookingRoutes from './routes/bookingRoutes.js';

const app = express();
const PORT = 3000;

app.use(express.json());

app.use('/api/v1', bookingRoutes);

app.listen(PORT, () => {
    console.log(`Server process is actively monitoring port ${PORT}`);
});