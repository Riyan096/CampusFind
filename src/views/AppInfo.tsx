import React from 'react';
import { Card } from '../components/UI';
import { Zap, Users, MessageCircle, Trophy, MapPin, Shield } from 'lucide-react';

export const AppInfo: React.FC = () => {
  return (
    <div className="space-y-6 pb-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary mb-2">About CampusFind</h1>
        <p className="text-gray-600">
          The smart lost & found platform for your campus community
        </p>
      </div>

      {/* Mission */}
      <Card className="p-6 bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">The Mission</h2>
            <p className="text-gray-600 leading-relaxed">
              CampusFind helps students and faculty reconnect with their lost belongings quickly and securely. 
              No more checking multiple lost & found boxes or scrolling through social media posts.
            </p>
          </div>
        </div>
      </Card>

      {/* Key Features */}
      <section>
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Key Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Easy Reporting</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Report lost or found items with photos, descriptions, and location tags in seconds.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg text-green-600">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Secure Messaging</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Chat safely with finders or owners without sharing personal contact information.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Gamification</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Earn points, unlock achievements, and compete on the leaderboard for helping others.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Campus Map</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Visualize where items were lost or found with our interactive campus map.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section>
        <h2 className="text-lg font-bold text-gray-800 mb-4">How It Works</h2>
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">1</div>
              <div>
                <h3 className="font-semibold text-gray-800">Report</h3>
                <p className="text-sm text-gray-600">Upload a photo and details of your lost or found item</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">2</div>
              <div>
                <h3 className="font-semibold text-gray-800">Match</h3>
                <p className="text-sm text-gray-600">Our system notifies potential matches automatically</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">3</div>
              <div>
                <h3 className="font-semibold text-gray-800">Connect</h3>
                <p className="text-sm text-gray-600">Chat securely and arrange to return the item</p>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Version Info */}
      <div className="text-center text-sm text-gray-500 pt-4 border-t border-gray-200">
        <p>CampusFind v1.0</p>
        <p className="mt-1">Built with React, Firebase, and ❤️ for the campus community</p>
      </div>
    </div>
  );
};
