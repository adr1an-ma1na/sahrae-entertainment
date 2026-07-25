import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Track } from './ytmusic';

// Initialize Firebase for Google OAuth Sign-In
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export interface YoutubeUserProfile {
  name?: string;
  picture?: string;
  email?: string;
}

export interface YoutubePlaylist {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  trackCount: number;
}

class YoutubeService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('sahrae.youtube.token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('sahrae.youtube.token', token);
    localStorage.setItem('sahrae.youtube.token_time', Date.now().toString());
  }

  getToken(): string | null {
    const stored = localStorage.getItem('sahrae.youtube.token');
    const timeStr = localStorage.getItem('sahrae.youtube.token_time');
    if (!stored || !timeStr) return null;

    // Tokens expire after 1 hour (3600 seconds)
    const elapsed = Date.now() - parseInt(timeStr, 10);
    if (elapsed > 3600 * 1000) {
      this.disconnect();
      return null;
    }
    this.token = stored;
    return stored;
  }

  disconnect() {
    this.token = null;
    localStorage.removeItem('sahrae.youtube.token');
    localStorage.removeItem('sahrae.youtube.token_time');
    localStorage.removeItem('sahrae.youtube.profile');
  }

  isConnected(): boolean {
    return this.getToken() !== null;
  }

  getOAuthClientId(): string {
    return firebaseConfig.oAuthClientId || '';
  }

  // Trigger Google Auth via Firebase SDK Popup (this bypasses redirect_uri_mismatch)
  async signInWithGoogle(): Promise<string> {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
    provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
    
    // Forces consent dialog to ensure refresh token / consistent access if needed
    provider.setCustomParameters({
      prompt: 'consent'
    });

    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error('Failed to obtain Google access token.');
      }

      this.setToken(token);
      return token;
    } catch (err: any) {
      console.error('Google Sign-In Popup failed:', err);
      throw new Error(err.message || 'Google Sign-In failed.');
    }
  }

  private async fetchFromGoogle<T>(endpoint: string): Promise<T> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Not connected to YouTube');
    }

    const response = await fetch(`https://www.googleapis.com/${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.disconnect();
        throw new Error('Session expired. Please reconnect your YouTube account.');
      }
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || 'Failed to fetch from YouTube API');
    }

    return response.json();
  }

  async fetchUserProfile(): Promise<YoutubeUserProfile> {
    try {
      const data = await this.fetchFromGoogle<any>('oauth2/v1/userinfo');
      const profile: YoutubeUserProfile = {
        name: data.name,
        picture: data.picture,
        email: data.email
      };
      localStorage.setItem('sahrae.youtube.profile', JSON.stringify(profile));
      return profile;
    } catch (err) {
      console.error('Error fetching Google user profile:', err);
      // Fallback to cached profile if any
      const cached = localStorage.getItem('sahrae.youtube.profile');
      if (cached) return JSON.parse(cached);
      throw err;
    }
  }

  async fetchPlaylists(): Promise<YoutubePlaylist[]> {
    const data = await this.fetchFromGoogle<any>('youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50');
    if (!data.items) return [];

    return data.items.map((item: any) => {
      const snippet = item.snippet || {};
      const contentDetails = item.contentDetails || {};
      const thumbnails = snippet.thumbnails || {};

      return {
        id: item.id,
        title: snippet.title || 'Untitled Playlist',
        description: snippet.description || '',
        thumbnail: thumbnails.medium?.url || thumbnails.default?.url || '',
        trackCount: contentDetails.itemCount || 0
      };
    });
  }

  async fetchPlaylistTracks(playlistId: string): Promise<Track[]> {
    const data = await this.fetchFromGoogle<any>(
      `youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50`
    );
    if (!data.items) return [];

    return data.items
      .filter((item: any) => item.snippet?.resourceId?.videoId)
      .map((item: any) => {
        const snippet = item.snippet;
        const thumbnails = snippet.thumbnails || {};
        const videoId = snippet.resourceId.videoId;

        // Visual design color
        let hash = 0;
        for (let i = 0; i < videoId.length; i++) {
          hash = (hash * 31 + videoId.charCodeAt(i)) >>> 0;
        }
        const dominantColor = `hsl(${hash % 360}, 58%, 40%)`;

        return {
          id: videoId,
          title: snippet.title || 'Unknown Title',
          artist: snippet.videoOwnerChannelTitle || snippet.channelTitle || 'YouTube Sync',
          artwork: thumbnails.medium?.url || thumbnails.default?.url || '',
          artworkLarge: thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || '',
          duration: 180, // Default duration fallback
          dominantColor
        };
      });
  }

  // YouTube Liked Music is stored under special playlist ID 'LM'
  // Or Liked Videos under special playlist ID 'LL'
  async fetchLikedMusic(): Promise<Track[]> {
    try {
      // First try LM (Liked Music - specific to YT Music)
      return await this.fetchPlaylistTracks('LM');
    } catch (err) {
      console.warn('Liked Music (LM) failed, falling back to Liked Videos (LL):', err);
      try {
        // Fallback to LL (Liked Videos)
        return await this.fetchPlaylistTracks('LL');
      } catch (err2) {
        console.error('Liked Videos (LL) also failed:', err2);
        throw new Error('Could not retrieve Liked Music or Liked Videos from YouTube.');
      }
    }
  }
}

export const youtubeService = new YoutubeService();
