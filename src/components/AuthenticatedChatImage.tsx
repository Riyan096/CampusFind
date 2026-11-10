import React, { useEffect, useState } from 'react';
import { auth } from '../services/firebase';
import type { ImageAttachment } from '../services/chatService';

interface AuthenticatedChatImageProps {
  chatId: string;
  messageId: string;
  attachment: ImageAttachment;
}

const MEDIA_WORKER_URL = (import.meta.env.VITE_MEDIA_WORKER_URL || 'http://localhost:8787').replace(/\/$/, '');

export const AuthenticatedChatImage: React.FC<AuthenticatedChatImageProps> = ({
  chatId,
  messageId,
  attachment,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    const controller = new AbortController();

    const loadImage = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Sign in to view this photo.');

        const token = await currentUser.getIdToken();
        const params = new URLSearchParams({
          chatId,
          messageId,
          publicId: attachment.publicId,
          format: attachment.format,
        });
        const response = await fetch(MEDIA_WORKER_URL + '/api/media?' + params.toString(), {
          headers: { Authorization: 'Bearer ' + token },
          signal: controller.signal,
        });

        if (!response.ok) throw new Error('Unable to load this photo.');
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('The media response was not an image.');

        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          console.error('Unable to load chat photo:', loadError);
          setError(true);
        }
      }
    };

    void loadImage();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [chatId, messageId, attachment.publicId, attachment.format]);

  useEffect(() => {
    if (!isViewerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsViewerOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isViewerOpen]);

  if (error) return <p className="mt-2 text-xs opacity-75">Photo unavailable</p>;
  if (!imageUrl) {
    return <div className="mt-2 h-36 w-48 max-w-full animate-pulse rounded-lg bg-black/10" aria-label="Loading photo" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsViewerOpen(true)}
        className="mt-2 block cursor-zoom-in rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="View photo"
      >
        <img
          src={imageUrl}
          alt="Photo attachment"
          loading="lazy"
          className="max-h-72 max-w-full rounded-lg object-contain"
        />
      </button>

      {isViewerOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={() => setIsViewerOpen(false)}
        >
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <a
              href={imageUrl}
              download={`campusfind-photo-${messageId}.${attachment.format}`}
              onClick={(event) => event.stopPropagation()}
              className="flex h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-medium text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Download photo"
            >
              <span className="material-icons text-xl" aria-hidden="true">download</span>
              <span>Download</span>
            </a>
            <button
              type="button"
              onClick={() => setIsViewerOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Close photo viewer"
            >
              <span className="material-icons" aria-hidden="true">close</span>
            </button>
          </div>
          <img
            src={imageUrl}
            alt="Photo attachment enlarged"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
};
