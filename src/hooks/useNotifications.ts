import { useState, useEffect } from 'react';
import { useMyList } from './useMyList';
import { fetchMediaDetails } from '../services/tmdb';

export interface AppNotification {
  id: string;
  mediaId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  posterPath: string | null;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const saved = localStorage.getItem('sahrae_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  const [isChecking, setIsChecking] = useState(false);
  const { myList } = useMyList();

  useEffect(() => {
    localStorage.setItem('sahrae_notifications', JSON.stringify(notifications));
  }, [notifications]);

  const checkUpdates = async () => {
    // Only check once every 5 minutes to avoid API spam but allow testing
    const lastCheck = localStorage.getItem('sahrae_last_notification_check');
    const now = Date.now();
    if (lastCheck && now - parseInt(lastCheck) < 5 * 60 * 1000) {
      return;
    }

    if (myList.length === 0) {
      if (notifications.length === 0) {
        setNotifications([{
          id: 'welcome_notif',
          mediaId: 0,
          mediaType: 'movie',
          title: 'Welcome to Notifications!',
          message: 'Add movies and TV shows to My List to get notified about new episodes and releases.',
          timestamp: Date.now(),
          read: false,
          posterPath: null
        }]);
      }
      return;
    }

    setIsChecking(true);
    const newNotifications: AppNotification[] = [];

    try {
      // Check up to 10 most recently added items to My List
      const itemsToCheck = myList.slice(0, 10);
      
      for (const item of itemsToCheck) {
        if (!item.media_type) continue;
        
        const details = await fetchMediaDetails(item.id, item.media_type);
        
        if (item.media_type === 'tv') {
          // Check for new episode that aired recently (last 3 days)
          if (details.last_episode_to_air && details.last_episode_to_air.air_date) {
            const airDate = new Date(details.last_episode_to_air.air_date).getTime();
            const daysSinceAir = (now - airDate) / (1000 * 60 * 60 * 24);
            
            if (daysSinceAir >= 0 && daysSinceAir <= 7) {
              const notifId = `new_ep_${item.id}_${details.last_episode_to_air.season_number}_${details.last_episode_to_air.episode_number}`;
              
              // Check if we already have this notification
              if (!notifications.some(n => n.id === notifId) && !newNotifications.some(n => n.id === notifId)) {
                newNotifications.push({
                  id: notifId,
                  mediaId: item.id,
                  mediaType: 'tv',
                  title: `New Episode Available`,
                  message: `${item.title || item.name} S${details.last_episode_to_air.season_number} E${details.last_episode_to_air.episode_number} just aired!`,
                  timestamp: now,
                  read: false,
                  posterPath: item.poster_path
                });
              }
            }
          }
          
          // Check for upcoming episode (next 3 days)
          if (details.next_episode_to_air && details.next_episode_to_air.air_date) {
            const airDate = new Date(details.next_episode_to_air.air_date).getTime();
            const daysUntilAir = (airDate - now) / (1000 * 60 * 60 * 24);
            
            if (daysUntilAir >= 0 && daysUntilAir <= 7) {
              const notifId = `upcoming_ep_${item.id}_${details.next_episode_to_air.season_number}_${details.next_episode_to_air.episode_number}`;
              
              if (!notifications.some(n => n.id === notifId) && !newNotifications.some(n => n.id === notifId)) {
                newNotifications.push({
                  id: notifId,
                  mediaId: item.id,
                  mediaType: 'tv',
                  title: `Upcoming Episode`,
                  message: `${item.title || item.name} S${details.next_episode_to_air.season_number} E${details.next_episode_to_air.episode_number} airs in ${Math.ceil(daysUntilAir)} days!`,
                  timestamp: now,
                  read: false,
                  posterPath: item.poster_path
                });
              }
            }
          }
        } else if (item.media_type === 'movie') {
           // Check for recent movie release
           if (details.release_date) {
             const releaseDate = new Date(details.release_date).getTime();
             const daysSinceRelease = (now - releaseDate) / (1000 * 60 * 60 * 24);
             
             if (daysSinceRelease >= 0 && daysSinceRelease <= 14) {
               const notifId = `new_movie_${item.id}`;
               if (!notifications.some(n => n.id === notifId) && !newNotifications.some(n => n.id === notifId)) {
                 newNotifications.push({
                    id: notifId,
                    mediaId: item.id,
                    mediaType: 'movie',
                    title: `New Movie Release`,
                    message: `${item.title || item.name} is now available to watch!`,
                    timestamp: now,
                    read: false,
                    posterPath: item.poster_path
                 });
               }
             }
           }
        }
      }

      if (newNotifications.length > 0) {
        setNotifications(prev => [...newNotifications, ...prev].slice(0, 50)); // Keep max 50
      }
      
      localStorage.setItem('sahrae_last_notification_check', now.toString());
    } catch (error) {
      console.error("Failed to check for updates:", error);
    } finally {
      setIsChecking(false);
    }
  };

  const addNotification = (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: AppNotification = {
      ...notif,
      id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications(prev => [newNotif, ...prev].slice(0, 50));
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    isChecking,
    checkUpdates,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    addNotification
  };
}
