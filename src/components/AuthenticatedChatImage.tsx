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

  if (error) return <p className="mt-2 text-xs opacity-75">Photo unavailable</p>;
  if (!imageUrl) {
    return <div className="mt-2 h-36 w-48 max-w-full animate-pulse rounded-lg bg-black/10" aria-label="Loading photo" />;
  }

  return (
    <a href={imageUrl} target="_blank" rel="noreferrer" className="mt-2 block">
      <img
        src={imageUrl}
        alt="Photo attachment"
        loading="lazy"
        className="max-h-72 max-w-full rounded-lg object-contain"
      />
    </a>
  );
};
