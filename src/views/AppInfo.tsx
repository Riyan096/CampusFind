import React from 'react';
import { Card } from '../components/UI';
import { Server, Shield, Cpu, Layers, Users, Zap } from 'lucide-react';

export const AppInfo: React.FC = () => {
  return (
    <div className="space-y-6 pb-8">
      <div className="prose prose-slate max-w-none">
        <h2 className="text-2xl font-bold text-slate-800">Project Design Document</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          This document outlines the problem statement, core features, and technical architecture for the CampusFind Lost & Found system, designed for future scalability using Firebase and Open Source mapping.
        </p>
      </div>

      {/* 1. Problem & Users */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">1. Problem & Users</h3>
        <Card className="p-4 border-l-4 border-l-slate-800">
          <div className="flex gap-3">
            <Users className="w-5 h-5 text-slate-600 shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-slate-800">The Problem</h4>
              <p className="text-sm text-slate-600 mt-1">
                Campus items are frequently lost, but recovery relies on fragmented systems (physical boxes, disjointed social media posts). This leads to low recovery rates and wasted time.
              </p>
              <h4 className="font-semibold text-slate-800 mt-3">Target Users</h4>
              <ul className="list-disc list-inside text-sm text-slate-600 mt-1">
                <li><strong>Students:</strong> High-frequency movers who lose electronics/IDs.</li>
                <li><strong>Faculty/Staff:</strong> Often find items in classrooms.</li>
                <li><strong>Campus Security:</strong> Manage central collection points.</li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      {/* 2. Core & Advanced Features */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">2. Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <h4 className="font-semibold text-brand-700 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Core Features
            </h4>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Report Lost & Found items (Photo/Desc).</li>
              <li>• Categorized Browsing & Search.</li>
              <li>• Location Tagging (Campus Zones).</li>
              <li>• Secure in-app messaging (Privacy masked).</li>
            </ul>
          </Card>
          <Card className="p-4">
            <h4 className="font-semibold text-indigo-700 mb-2 flex items-center gap-2">
              <Cpu className="w-4 h-4" /> Advanced
            </h4>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• <strong>AI Image Analysis:</strong> Auto-tagging via Gemini.</li>
              <li>• <strong>Matching Algorithm:</strong> Notify users of potential matches.</li>
              <li>• <strong>Verification:</strong> QR Code generation for item handover.</li>
              <li>• <strong>Rewards:</strong> Gamified points for returning items.</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* 3. Tech Stack */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">3. Tech Stack (Free Tier Optimized)</h3>
        <Card className="p-5 border-l-4 border-l-orange-500">
          <div className="flex items-start gap-4">
             <div className="p-2 bg-orange-100 rounded-lg text-orange-700">
                <Layers className="w-6 h-6" />
             </div>
             <div className="space-y-4 w-full">
                <div>
                  <h4 className="font-bold text-slate-800">Frontend</h4>
                  <p className="text-sm text-slate-600">React (Web) + PWA support or React Native (Mobile). Tailwind CSS for styling.</p>
                </div>
                
                <div className="pt-2 border-t border-slate-100">
                  <h4 className="font-bold text-slate-800">Backend & Database (Firebase)</h4>
                  <ul className="text-sm text-slate-600 mt-1 space-y-1">
                    <li><strong className="text-orange-600">Authentication:</strong> Firebase Auth (Email/University SSO).</li>
                    <li><strong className="text-orange-600">Database:</strong> Firestore (NoSQL) for flexible item schemas.</li>
                    <li><strong className="text-orange-600">Storage:</strong> Firebase Storage for item photos.</li>
                    <li><strong className="text-orange-600">Notifications:</strong> Cloud Messaging (FCM) for match alerts.</li>
                  </ul>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <h4 className="font-bold text-slate-800">AI & Maps</h4>
                  <ul className="text-sm text-slate-600 mt-1 space-y-1">
                    <li><strong className="text-blue-600">Maps:</strong> OpenStreetMap (via Leaflet or Mapbox GL JS). Free and open-source.</li>
                    <li><strong className="text-purple-600">AI:</strong> Google Gemini API (Multimodal) for superior image reasoning vs standard OCR.</li>
                  </ul>
                </div>
             </div>
          </div>
        </Card>
      </section>

      {/* 4. Architecture & Scalability */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">4. Architecture & Scalability</h3>
        
        <Card className="p-4 bg-slate-800 text-slate-200">
          <h4 className="font-bold text-white mb-2 flex items-center gap-2"><Server className="w-4 h-4"/> System Flow</h4>
          <div className="font-mono text-xs space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-slate-700 px-2 py-1 rounded">Client App</span> 
              <span>→</span>
              <span className="bg-orange-900/50 text-orange-200 px-2 py-1 rounded">Firebase Functions</span>
              <span>→</span>
              <span className="bg-purple-900/50 text-purple-200 px-2 py-1 rounded">Gemini AI</span>
            </div>
            <p className="text-slate-400 pl-2 border-l-2 border-slate-600 italic">
              1. User uploads photo → 2. Cloud Function triggers → 3. AI extracts tags → 4. Firestore updates → 5. Notification sent to potential owners.
            </p>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-start gap-3">
             <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
                <Shield className="w-5 h-5" />
             </div>
             <div>
                <h3 className="font-bold text-slate-800">Future Improvements</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                   <li><strong>Integration:</strong> Connect with Campus ID card systems for easy login.</li>
                   <li><strong>Computer Vision:</strong> Use dedicated custom models (TensorFlow Lite) on-device for offline recognition.</li>
                   <li><strong>Smart Zones:</strong> Use Bluetooth Beacons (BLE) in high-traffic areas (library, gym) for precise indoor location.</li>
                </ul>
             </div>
          </div>
        </Card>
      </section>
    </div>
  );
};
