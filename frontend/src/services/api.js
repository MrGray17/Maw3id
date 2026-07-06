const API_BASE_URL = 'http://localhost:5000/api';

export const appointmentService = {

    getAllSlots: async () => {
        try {

            const response = await fetch(`${API_BASE_URL}/slots`);

            if (!response.ok) {
                throw new Error (`Backend network error! Status: ${response.status}`);
            }
            return await response.json();
        }

        catch (error) {
            console.error("Critical failure inside appointementServices.getAllSlots:" , error);

            throw error ;
        }

        
    }
}