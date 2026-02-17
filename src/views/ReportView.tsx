import React, { useState, useRef, useCallback, useMemo } from 'react';
import { ItemType, ItemCategory, CampusLocation, ItemStatus } from '../types';
import { Button, Input, Select, Card } from '../components/UI';
import { analyzeItemImage } from '../services/geminiService';
import { addItemToFirestore } from '../services/itemService';
import { useAuth } from '../context/AuthContext';
import { addPoints } from '../services/StorageService';


interface ReportViewProps {
  onSuccess: () => void;
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

  // Memoized callbacks
  const handleTypeChange = useCallback((newType: ItemType) => {
    setType(newType);
  }, []);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setImage(base64);
      
      // If finding an item, auto-analyze
      if (type === ItemType.FOUND) {
        setLoading(true);
        try {
          const analysis = await analyzeItemImage(base64);
          setTitle(analysis.title);
          setDescription(analysis.description);
          setCategory(analysis.category);
          setAiTags(analysis.tags);
        } catch (err) {
          console.error("AI Analysis failed", err);
        } finally {
          setLoading(false);
        }
      }
    };
    reader.readAsDataURL(file);
  }, [type]);

  const handleRemoveImage = useCallback(() => {
    setImage(null);
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
        status: ItemStatus.OPEN,
        aiTags,
        reportedBy: user.uid,
      };
      
      // Only add imageUrl if there's an image (Firestore doesn't allow undefined)
      if (image) {
        newItem.imageUrl = image;
      }

      
      
      await addItemToFirestore(newItem);
      
      // Award points for reporting an item
      const stats = addPoints(10); // 10 points for reporting
      console.log(`🎉 Item reported! Earned 10 points! Total: ${stats.points} points`);
      
      onSuccess();
    } catch (err: any) {

      console.error('Error saving item:', err);
      const errorMessage = err?.message || err?.code || 'Unknown error';
      alert(`Failed to save item: ${errorMessage}`);
    }

  }, [type, title, description, category, location, image, aiTags, user, onSuccess]);


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
