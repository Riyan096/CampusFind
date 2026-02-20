import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { ItemType, ItemCategory, CampusLocation, ItemStatus, LostItemStatus, FoundItemStatus, type Item } from '../types';


import { Button, Input, Select, Card } from '../components/UI';
import { analyzeItemImage } from '../services/geminiService';
import { addItemToFirestore } from '../services/itemService';
import { checkForMatchesAndNotify, type MatchResult } from '../services/matchingService';

import { useAuth } from '../context/AuthContext';
import { addPoints } from '../services/StorageService';
import { createNotification } from '../services/notificationService';


interface ReportViewProps {
  onSuccess: () => void;
}

interface PotentialMatch {
  item: Item;
  confidence: 'high' | 'medium' | 'low';
}

export const ReportView: React.FC<ReportViewProps> = React.memo(({ onSuccess }) => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<ItemType>(ItemType.FOUND);
  
  // Form State
  const [image, setImage] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ItemCategory>(ItemCategory.OTHER);
  const [location, setLocation] = useState<CampusLocation>(CampusLocation.STUDENT_CENTER);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [useAI, setUseAI] = useState<boolean>(() => {
    const saved = localStorage.getItem('campusfind_use_ai');
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  // Matching State
  const [potentialMatches, setPotentialMatches] = useState<PotentialMatch[]>([]);
  const [checkingMatches, setCheckingMatches] = useState(false);
  const [showMatches, setShowMatches] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Memoized category options
  const categoryOptions = useMemo(() => 
    Object.values(ItemCategory).map(c => ({ label: c, value: c })),
    []
  );

  // Memoized location options
  const locationOptions = useMemo(() => 
    Object.values(CampusLocation).map(l => ({ label: l, value: l })),
    []
  );

  // Handle matches found by the matching service
  const handleMatchesFound = useCallback((matches: MatchResult[]) => {
    const potentialMatches: PotentialMatch[] = matches.map(match => ({
      item: match.lostItem,
      confidence: match.confidence,
      score: match.score,
      reasons: match.reasons
    }));
    setPotentialMatches(potentialMatches);
    setShowMatches(true);
  }, []);


  // Check for matching lost items when AI analysis is complete
  const checkForMatches = useCallback(async (analysis: { title: string; description: string; category: ItemCategory; tags: string[] }) => {
    if (!analysis.title || analysis.title === 'Unknown Item') return;
    
    setCheckingMatches(true);
    try {
      // Create a temporary found item object for matching
      const tempFoundItem: Item = {
        id: 'temp',
        type: ItemType.FOUND,
        title: analysis.title,
        description: analysis.description,
        category: analysis.category,
        location: CampusLocation.STUDENT_CENTER, // Default, will be updated
        date: new Date().toISOString(),
        status: FoundItemStatus.AVAILABLE,
        aiTags: analysis.tags
      };

      // Use the new matching service
      await checkForMatchesAndNotify(tempFoundItem, handleMatchesFound);
    } catch (err) {
      console.error('Error checking for matches:', err);
    } finally {
      setCheckingMatches(false);
    }
  }, [handleMatchesFound]);


  // Memoized callbacks
  const handleTypeChange = useCallback((newType: ItemType) => {
    setType(newType);
    // Clear matches when switching types
    setPotentialMatches([]);
    setShowMatches(false);
  }, []);

  const handleToggleAI = useCallback(() => {
    const newValue = !useAI;
    setUseAI(newValue);
    localStorage.setItem('campusfind_use_ai', JSON.stringify(newValue));
  }, [useAI]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setImage(base64);
      
      // If finding an item AND AI is enabled, auto-analyze
      if (type === ItemType.FOUND && useAI) {
        setLoading(true);
        try {
          const analysis = await analyzeItemImage(base64);
          setTitle(analysis.title);
          setDescription(analysis.description);
          setCategory(analysis.category);
          setAiTags(analysis.tags);
          
          // Check for matching lost items
          await checkForMatches(analysis);
        } catch (err) {
          console.error("AI Analysis failed", err);
        } finally {
          setLoading(false);
        }
      }
    };
    reader.readAsDataURL(file);
  }, [type, useAI, checkForMatches]);

  const handleRemoveImage = useCallback(() => {
    setImage(null);
    setPotentialMatches([]);
    setShowMatches(false);
  }, []);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  }, []);

  const handleCategoryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(e.target.value as ItemCategory);
  }, []);

  const handleLocationChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocation(e.target.value as CampusLocation);
  }, []);

  const handleNotifyOwner = useCallback(async (match: PotentialMatch) => {
    if (!user || !match.item.reportedBy) return;
    
    try {
      await createNotification({
        userId: match.item.reportedBy,
        title: 'Potential Match Found!',
        message: `Someone found an item that might be yours: "${title}". Check the Reports page for details.`,
        type: 'item_match',
        relatedItemId: match.item.id,
      });

      
      alert(`Notification sent to the owner of "${match.item.title}"!`);
    } catch (err) {
      console.error('Error sending notification:', err);
      alert('Failed to send notification. Please try again.');
    }
  }, [user, title]);

  const handleSubmit = useCallback(async () => {
    if (!user) {
      alert('Please sign in to report an item');
      return;
    }
    
    try {
      const newItem: any = {
        type,
        title,
        description,
        category,
        location,
        date: new Date().toISOString(),
        status: type === ItemType.LOST ? LostItemStatus.STILL_LOST : FoundItemStatus.AVAILABLE,

        aiTags,
        reportedBy: user.uid,
        reporterName: user.displayName || 'Anonymous',
      };

      
      // Only add imageUrl if there's an image (Firestore doesn't allow undefined)
      if (image) {
        newItem.imageUrl = image;
      }

      
      
      await addItemToFirestore(newItem);
      
      // Award points for reporting an item
      const stats = await addPoints(10, 'report'); // 10 points for reporting
      console.log(`🎉 Item reported! Earned 10 points! Total: ${stats.points} points`);


      // Check for matches after reporting
      if (type === ItemType.FOUND) {
        // For found items, check against lost items
        const tempItem = { ...newItem, id: 'temp' };
        await checkForMatchesAndNotify(tempItem, handleMatchesFound);
      }
      
      onSuccess();
    } catch (err: any) {

      console.error('Error saving item:', err);
      const errorMessage = err?.message || err?.code || 'Unknown error';
      alert(`Failed to save item: ${errorMessage}`);
    }

  }, [type, title, description, category, location, image, aiTags, user, onSuccess, handleMatchesFound]);



  const handleTriggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Memoized validation
  const isSubmitDisabled = useMemo(() => {
    return !title || !description || (type === ItemType.FOUND && !image);
  }, [title, description, type, image]);

  return (
    <div className="max-w-xl mx-auto py-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Report an Item</h2>
        <p className="text-gray-500 text-sm mt-1">Help get items back to their owners.</p>

      </div>


      {/* Step 1: Type Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">What are you reporting?</label>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleTypeChange(ItemType.LOST)}
            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
              type === ItemType.LOST 
                ? 'border-red-500 bg-red-50 text-red-700' 
                : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
            }`}
          >

            <div className="font-bold text-lg">I Lost Something</div>
            <div className="text-xs opacity-75">Help me find it</div>
          </button>
          <button
            onClick={() => handleTypeChange(ItemType.FOUND)}
            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
              type === ItemType.FOUND 
                ? 'border-primary bg-primary/5 text-primary' 
                : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
            }`}
          >

            <div className="font-bold text-lg">I Found Something</div>
            <div className="text-xs opacity-75">I want to return it</div>
          </button>
        </div>
      </div>


      <Card className="p-6 space-y-6">
        {/* AI Toggle - Only show for FOUND items */}
        {type === ItemType.FOUND && (
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2">
              <span className="material-icons text-blue-600">auto_awesome</span>
              <div>
                <p className="text-sm font-medium text-gray-800">AI Image Analysis</p>
                <p className="text-xs text-gray-500">Automatically fill details from photo</p>
              </div>
            </div>
            <button
              onClick={handleToggleAI}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                useAI ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  useAI ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Photo {type === ItemType.LOST ? '(Optional)' : '(Required)'}
          </label>

          
          {!image ? (
            <div 
              onClick={handleTriggerFileInput}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center text-gray-500 cursor-pointer hover:bg-gray-50 transition-colors bg-gray-50/50"
            >
              <span className="material-icons text-4xl mb-2 text-gray-400">add_a_photo</span>
              <p className="text-sm font-medium">Tap to take photo or upload</p>
              <p className="text-xs text-gray-400 mt-1">Supports JPG, PNG</p>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden bg-gray-100 border border-gray-200">

              <img src={image} alt="Preview" className="w-full h-56 object-cover opacity-90" />
              <button 
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 flex items-center justify-center"
              >
                <span className="material-icons text-sm">close</span>
              </button>
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white backdrop-blur-sm">
                  <span className="material-icons text-3xl animate-spin mb-2 text-secondary">autorenew</span>
                  <p className="font-medium text-secondary">AI Analyzing...</p>
                </div>
              )}
            </div>
          )}

          <input 
            ref={fileInputRef} 
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handleImageUpload} 
          />
        </div>

        {/* Potential Matches Section */}
        {type === ItemType.FOUND && showMatches && potentialMatches.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons text-amber-600">notifications_active</span>
              <h3 className="font-semibold text-gray-800">Potential Matches Found!</h3>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              These lost items might match what you found. Consider notifying the owners:
            </p>
            
            <div className="space-y-3">
              {potentialMatches.map((match) => (
                <div 
                  key={match.item.id} 
                  className="bg-white rounded-lg p-3 border border-amber-100 flex items-start gap-3"
                >
                  {match.item.imageUrl && (
                    <img 
                      src={match.item.imageUrl} 
                      alt={match.item.title}
                      className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-800 truncate">{match.item.title}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        match.confidence === 'high' 
                          ? 'bg-green-100 text-green-700' 
                          : match.confidence === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {match.confidence === 'high' ? 'High Match' : match.confidence === 'medium' ? 'Medium Match' : 'Possible Match'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{match.item.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Lost at: {match.item.location} • Reported by: {match.item.reporterName || 'Unknown'}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleNotifyOwner(match)}
                    className="flex-shrink-0 text-xs"
                  >
                    Notify Owner
                  </Button>
                </div>
              ))}
            </div>
            
            <button
              onClick={() => setShowMatches(false)}
              className="mt-3 text-sm text-gray-500 hover:text-gray-700"
            >
              Dismiss matches
            </button>
          </div>
        )}

        {/* No Matches Message */}
        {type === ItemType.FOUND && showMatches && potentialMatches.length === 0 && !checkingMatches && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
            <span className="material-icons text-gray-400 text-3xl mb-2">search_off</span>
            <p className="text-sm text-gray-600">No matching lost items found.</p>
            <p className="text-xs text-gray-500 mt-1">Your found item will still be posted for others to see.</p>
          </div>
        )}

        {/* Checking Matches Loading */}
        {type === ItemType.FOUND && checkingMatches && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <span className="material-icons text-blue-500 text-3xl mb-2 animate-spin">autorenew</span>
            <p className="text-sm text-blue-700">Checking for matching lost items...</p>
          </div>
        )}

        {/* Details Form */}
        <div className="space-y-4">
          <Input 
            label="Title" 
            placeholder={type === ItemType.FOUND ? "e.g., Blue Water Bottle" : "What did you lose?"}
            value={title}
            onChange={handleTitleChange}
          />
          
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
             <textarea 
                className="w-full px-4 py-2 border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary min-h-[100px] bg-white text-gray-900"
                placeholder="Provide details about distinctive marks, stickers, or brand."
                value={description}
                onChange={handleDescriptionChange}
             />

          </div>


          <div className="grid grid-cols-2 gap-4">
            <Select 
              label="Category"
              value={category}
              onChange={handleCategoryChange}
              options={categoryOptions}
            />
            <Select 
              label="Location"
              value={location}
              onChange={handleLocationChange}
              options={locationOptions}
            />
          </div>
          
          {aiTags.length > 0 && (
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">AI Tags</label>
                <div className="flex flex-wrap gap-2">
                   {aiTags.map(tag => (
                      <span key={tag} className="px-3 py-1 bg-cream-accent text-primary-dark text-xs font-medium rounded-full border border-primary/10">
                        #{tag}
                      </span>
                   ))}
                </div>
             </div>
          )}


        </div>

        <div className="pt-4">
          <Button 
            className="w-full text-lg py-3" 
            size="lg" 
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
          >
            Submit Report
          </Button>
        </div>
      </Card>
    </div>
  );
});

ReportView.displayName = 'ReportView';
