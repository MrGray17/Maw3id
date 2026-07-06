import pool from '../db.js' ;

export const getAllSlots = async (req , res) => {
    try {
        const result = await pool.query('SELECT * FROM slots ORDER BY id ASC');
        // FIX: Changed .row to .rows
        return res.status(200).json(result.rows); 
    }
    catch (error) {
        console.error("Database error in getAllSlots:", error);
        return res.status(500).json({ error: "Internal error: Failed to fetch time slots" });
    }
};

export const createBooking = async (req , res) => {
    const { slotId , name } = req.body;

    if (!slotId || !name) {
        return res.status(400).json({ error: "Validation Failed: Missing slotId or name." });
    }
    
    try {
        const slotCheck = await pool.query('SELECT * FROM slots WHERE id = $1', [slotId]);
        
        if (slotCheck.rows.length === 0) {
            return res.status(404).json({ error: `Not Found: Slot ID ${slotId} does not exist` });
        }

        const targetSlot = slotCheck.rows[0];

        if (targetSlot.is_booked) {
            return res.status(400).json({ error: "Conflict: This slot is already booked." });
        }
    
        await pool.query('UPDATE slots SET is_booked = true WHERE id = $1', [slotId]);

        const newBooking = await pool.query(
            'INSERT INTO bookings (patient_name, slot_id) VALUES ($1, $2) RETURNING *',
            [name, slotId]
        );

        return res.status(200).json({
            message: "Booking successfully secured!",
            bookingDetails: newBooking.rows[0]
        });
    }
    catch (error) {
        console.error("Database Error in createBooking:", error);
        return res.status(500).json({ error: "Internal Server Error: Transaction processing failed." });
    }
};