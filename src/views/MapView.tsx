import React, { useEffect, useRef, useState } from 'react';
import type { Item } from '../types';
import { CampusLocation, ItemType } from '../types';
import { Card, Badge } from '../components/UI';


interface MapViewProps {
  items: Item[];
}

// Map CampusLocation enums to real coordinates
const LOCATION_COORDS: Record<CampusLocation, [number, number]> = {
  [CampusLocation.KRESGE_LIBRARY]: [42.3584981154408, -83.06959390278607],
  [CampusLocation.UNDERGRAD_LIBRARY]: [42.356701097808745, -83.07014282302536],
  [CampusLocation.LAW_LIBRARY]: [42.360396040575246, -83.07101393836817],
  [CampusLocation.ART_BUILDING]: [42.35947565827378, -83.07024358069674],
  [CampusLocation.SCIENCE_HALL]: [42.35652963027699, -83.06725163586381],
  [CampusLocation.ENGINEERING]: [42.35572687149539, -83.07125158069691],
  [CampusLocation.BUSINESS_SCHOOL]: [42.34300904521446, -83.0561530537118],
  [CampusLocation.LAW_SCHOOL]: [42.36097449304988, -83.07082372302524],
  [CampusLocation.CHEMISTRY]: [42.357130773247405, -83.0673115469649],
  [CampusLocation.BIOLOGICAL_SCIENCES]: [42.356063270073534, -83.0697790537113],
  [CampusLocation.WILSON_HALL]: [42.35762621476322, -83.0680532549586],
  [CampusLocation.OLD_MAIN]: [42.35545461580442, -83.06688932302538],
  [CampusLocation.STEM_SILC]: [42.35625662379895, -83.06897973162192],
  [CampusLocation.STUDENT_CENTER]: [42.35833314764861, -83.07102517395037],
  [CampusLocation.UNIVERSITY_AUDITORIUM]: [42.359787587099774, -83.06984215371111],
  [CampusLocation.ANTHONY_APARTMENTS]: [42.35720767824726, -83.07303843162191],
  [CampusLocation.ATCHISON_HALL]: [42.35604074341812, -83.07158323836839],
  [CampusLocation.TOWERS_RESIDENCES]: [42.358112839412584, -83.07208114511467],
  [CampusLocation.CHATSWORTH_SUITES]: [42.357585544516915, -83.07099073836831],
  [CampusLocation.YOUSIF_GHAFAIRI_HALL]: [42.35669867636476, -83.0714870537113],
  [CampusLocation.FITNESS_CENTER]: [42.358009511419255, -83.07003016045766],
  [CampusLocation.MATTHAEI_PE_CENTER]: [42.3525, -83.0800],
  [CampusLocation.WAYNE_STATE_FIELDHOUSE]: [42.35357807192569, -83.07710553162204],
  [CampusLocation.TOWERS_CAFE]: [42.358112839412584, -83.07208114511467],
  [CampusLocation.PARKING_1]: [42.361735883282066, -83.0709940960396],
  [CampusLocation.PARKING_2]: [42.356600827566616, -83.07384643162194],
  [CampusLocation.PARKING_3]: [42.357604253394136, -83.06324390403337],
  [CampusLocation.PARKING_4]: [42.35595317107719, -83.0552067316219],
  [CampusLocation.PARKING_5]: [42.35824751500712, -83.07414140278617],
  [CampusLocation.PARKING_6]: [42.35704192534663, -83.06623991752635],
  [CampusLocation.PARKING_7]: [42.348555858858056, -83.05780976045794],
  [CampusLocation.PARKING_8]: [42.3537716996784, -83.06381520278632],
  [CampusLocation.TECHTOWN]: [42.36499381670887, -83.0729849739501],
  [CampusLocation.OTHER]: [42.3550, -83.0700],
  [CampusLocation.DETROIT_OPERA_HOUSE]: [0,0], // Placeholder, not on campus
};

export const MapView: React.FC<MapViewProps> = ({ items }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Filter only lost items
  const lostItems = items.filter(item => item.type === ItemType.LOST);

  // Function to navigate to item location
  const navigateToItem = (item: Item) => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    const coords = LOCATION_COORDS[item.location];
    if (coords) {
      const jitterLat = coords[0] + (Math.random() - 0.5) * 0.0005;
      const jitterLng = coords[1] + (Math.random() - 0.5) * 0.0005;
      
      setSelectedItem(item);
      map.setView([jitterLat, jitterLng], 17, { animate: true });
    }
  };


  useEffect(() => {
    // Access Leaflet from global scope (loaded via script tag)
    const L = (window as any).L;
    if (!L || !mapContainerRef.current) return;

    if (mapInstanceRef.current) return; // Map already initialized

    // Initialize Map centered on campus (using Old Main as approx center)
    const map = L.map(mapContainerRef.current).setView([42.3550, -83.0700], 15);
    mapInstanceRef.current = map;

    // Add OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Custom Icons using theme colors
    const lostIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #dc2626; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    const foundIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #0C5449; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });


    // Add Markers for Items
    items.forEach((item) => {
      const coords = LOCATION_COORDS[item.location];
      if (coords) {
        // Jitter coordinates slightly so items at same location don't perfectly overlap
        const jitterLat = coords[0] + (Math.random() - 0.5) * 0.0005;
        const jitterLng = coords[1] + (Math.random() - 0.5) * 0.0005;

        const marker = L.marker([jitterLat, jitterLng], {
          icon: item.type === ItemType.LOST ? lostIcon : foundIcon
        }).addTo(map);

        marker.on('click', (e: any) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          setSelectedItem(item);
          map.setView([jitterLat, jitterLng], 17, { animate: true });
        });

      }
    });




    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [items]);

  return (
    <div className="h-full flex relative">
      {/* Sidebar - Lost Items List */}
      <div 
        className={`absolute right-4 top-32 bottom-32 z-[400] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 transition-all duration-300 flex flex-col ${

          isSidebarOpen ? 'w-56 opacity-100' : 'w-8 opacity-90'
        }`}
      >




        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-5 h-8 bg-white rounded-full shadow-md border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors z-10"

          title={isSidebarOpen ? 'Minimize' : 'Expand'}
        >
          <span className="material-icons text-slate-600 text-xs">

            {isSidebarOpen ? 'remove' : 'add'}
          </span>
        </button>



        {/* Header */}
        <div className={`p-2 border-b border-slate-200 flex items-center justify-between ${!isSidebarOpen && 'justify-center'}`}>

          {isSidebarOpen ? (
            <>
              <div className="flex items-center gap-2">
                <span className="material-icons text-red-600 text-sm">search</span>
                <h3 className="font-bold text-slate-800 text-sm">Lost Items</h3>
                <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">

                  {lostItems.length}
                </span>
              </div>
            </>
          ) : (
            <span className="material-icons text-red-600 text-sm">search</span>
          )}
        </div>




        {/* Items List */}
        {isSidebarOpen && (
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {lostItems.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm">

                <span className="material-icons text-3xl mb-2 block">search_off</span>
                No lost items
              </div>
            ) : (
              lostItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigateToItem(item)}
                  className={`w-full text-left p-2 rounded-lg transition-all hover:bg-slate-50 border ${
                    selectedItem?.id === item.id 
                      ? 'bg-red-50 border-red-200 shadow-sm' 
                      : 'bg-white border-slate-100'
                  }`}

                >
                  <div className="flex gap-2">
                    <div className="w-10 h-10 bg-slate-100 rounded-md overflow-hidden shrink-0">

                      {item.imageUrl ? (
                        <img 
                          src={item.imageUrl} 
                          alt={item.title} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">

                          <span className="material-icons text-sm">image</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-800 text-xs truncate">{item.title}</h4>
                      <p className="text-xs text-slate-500 truncate">{item.location}</p>
                      <p className="text-[10px] text-slate-400">

                        {new Date(item.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}



      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 z-[400] bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow-md border border-slate-200 text-xs font-medium space-y-1 text-slate-800">

        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-600"></div>
          <span>Lost Items</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#0C5449' }}></div>
          <span>Found Items</span>
        </div>
      </div>


      {/* Map Container */}
      <div 
        ref={mapContainerRef} 
        className="flex-1 w-full h-full min-h-[400px] z-0 rounded-xl overflow-hidden shadow-inner border border-slate-200"

      />





      <div className={`absolute bottom-4 left-4 right-4 z-[500] transition-all duration-300 ease-out transform ${
        selectedItem ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
      }`}>
         <Card className="p-3 shadow-xl border-slate-300">
            <div className="flex gap-3">
               <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden shrink-0">

                  {selectedItem?.imageUrl ? (
                     <img src={selectedItem.imageUrl} alt={selectedItem.title} className="w-full h-full object-cover" />
                  ) : (
                     <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No Img</div>

                  )}
               </div>
               <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                     <div>
                        <Badge color={selectedItem?.type === ItemType.LOST ? 'red' : 'brand'}>{selectedItem?.type}</Badge>
                        <h3 className="font-bold text-slate-800 text-sm mt-1 truncate">{selectedItem?.title}</h3>

                     </div>
                     <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-slate-600">

                        &times;
                     </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{selectedItem?.description}</p>
                  <div className="text-xs text-slate-400 mt-1">{selectedItem && new Date(selectedItem.date).toLocaleDateString()} • {selectedItem?.location}</div>

               </div>
            </div>
         </Card>

      </div>

    </div>
  );
};
