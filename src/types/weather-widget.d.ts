declare module '@/features/weather/WeatherWidget.jsx' {
  import * as React from 'react';
  const Cmp: React.ComponentType<{ className?: string; onShiftComplete?: (msg: string) => void }>;
  export default Cmp;
}
