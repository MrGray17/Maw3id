let timeSlots = [
    { id: 1, provider: "Dr. Alex (Cardiology)", time: "09:00 AM", isBooked: false, patientName: null },
    { id: 2, provider: "Dr. Alex (Cardiology)", time: "10:30 AM", isBooked: false, patientName: null },
    { id: 3, provider: "Sarah (Pneumology)", time: "02:00 PM", isBooked: false, patientName: null }
];

export const getAllSlots = (req , res) => {
    return res.json(timeSlots) ;
};

export const createBooking = (req , res) => {
    const {slotId , name} = req.body ;

    if (!slotId || !name) {
        return res.status(400).json({error: "Validation Failed: Missing slotId or name."}) ;
    }
    
    const targetSlot = timeSlots.find(slot => slot.id ===parseInt(slotId));

    if (!targetSlot) {
       return res.status(404).json({error: `Not found: Slot ID ${slotId} does not exist.`});
    }

    if (targetSlot.isBooked) {
       return res.status(400).json({ error: "Conflict: This slot is already booked." });
    }

    targetSlot.isBooked = true ;
    targetSlot.patientName = name ;


    return res.status(200).json({
        message: "Booking successful." ,
        updatedSlot: targetSlot
    });

};