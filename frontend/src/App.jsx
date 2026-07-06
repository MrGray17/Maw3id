import { useState, useEffect } from 'react';
import { appointmentService } from './services/api';
import './App.css';

function SlotCard({ provider, time }) {
  return (
    <div className="slot-card">
      <h3>{provider}</h3>
      <p>{time}</p>
      <button>Book Appointment</button>
    </div>
  );
}

function App() {
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await appointmentService.getAllSlots();
        setSlots(data);
      } catch (error) {
        console.error('Database network error in UI component:', error);
      }
    };

    loadData();
  }, []);

  return (
    <div className='app-container'>
      <h1>Maw3id Appointment Desk</h1>
      
      <main className='slots-grid'>
        {slots.map((slot) => (
          <SlotCard
            key={slot.id}
            provider={slot.doctor}
            time={slot.time}
          />
        ))}
      </main>
    </div>
  );
}

export default App;