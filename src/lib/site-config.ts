/**
 * Single switchboard for the monetization / measurement layer. Everything is
 * OFF by default so the site stays clean and private until you deliberately
 * enable it — flip these flags (or wire them to env vars) when you're ready
 * to go live with analytics and ads.
 */
export interface SiteConfig {
  analytics: {
    /** 'none' disables analytics entirely (default). */
    provider: 'none' | 'plausible' | 'ga';
    /** The domain registered with the analytics provider (Plausible). */
    domain: string;
    /** Google Analytics 4 measurement id, e.g. "G-XXXXXXXXXX". */
    measurementId: string;
  };
  ads: {
    /** When false, AdSlot renders a clearly-labelled placeholder only. */
    enabled: boolean;
    /** Google AdSense publisher id, e.g. "ca-pub-XXXXXXXXXXXXXXXX". */
    adsenseClient: string;
    /**
     * The numeric ad-unit slot id from your AdSense dashboard for the
     * in-content unit (the string of digits in the unit's code).
     */
    inContentSlot: string;
    /**
     * Refresh the ad unit once when a game finishes. A finished game is a
     * genuine user-driven content change (AdSense forbids timed/auto
     * refresh), but enable this only deliberately — some publishers prefer
     * to leave it off, and premium networks handle refresh better. Off by
     * default.
     */
    refreshOnGameEnd: boolean;
  };
  accounts: {
    /**
     * When false (default), the site is fully guest/local — achievements and
     * badges work on-device, and the Account page shows sign-in as "coming
     * soon". Flip true once Supabase + Google OAuth are set up to enable
     * real login and cross-device cloud sync.
     */
    enabled: boolean;
    /** Supabase project URL, e.g. "https://xxxx.supabase.co". */
    supabaseUrl: string;
    /** Supabase anon/public key (safe in the browser; protected by RLS). */
    supabaseAnonKey: string;
  };
  push: {
    /**
     * Opt-in daily-reminder web push. When false, the reminder toggle is
     * hidden. Flip true once the Supabase backend (subscriptions table +
     * scheduled edge function) is deployed and the VAPID private key is set.
     */
    enabled: boolean;
    /** VAPID application-server public key (base64url) — safe in the browser. */
    vapidPublicKey: string;
  };
  /** Show ad placeholders even when ads are disabled (handy in development). */
  showAdPlaceholders: boolean;
}

export const SITE_CONFIG: SiteConfig = {
  analytics: {
    provider: 'ga',
    domain: 'cardhearth.com',
    measurementId: 'G-2QD63X4RF2',
  },
  ads: {
    enabled: false,
    adsenseClient: '',
    inContentSlot: '',
    refreshOnGameEnd: false,
  },
  accounts: {
    enabled: true,
    supabaseUrl: 'https://fyymkznfrxvnbfolttuq.supabase.co',
    supabaseAnonKey: 'sb_publishable_yUrVqY3hJXhD4zV6SdASaA_ntTBZQBm',
  },
  push: {
    enabled: false,
    vapidPublicKey: 'BPyH1wGhE0WOa42W7Pra1t_3MEICY4hD3QaqE5gEVTizxbVsx_Fg1JkBafWVuVAzg-WmxtBBv83GpxP8x8PYRFE',
  },
  showAdPlaceholders: false,
};
