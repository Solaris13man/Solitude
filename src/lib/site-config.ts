/**
 * Single switchboard for the monetization / measurement layer. Everything is
 * OFF by default so the site stays clean and private until you deliberately
 * enable it — flip these flags (or wire them to env vars) when you're ready
 * to go live with analytics and ads.
 */
export interface SiteConfig {
  analytics: {
    /** 'none' disables analytics entirely (default). */
    provider: 'none' | 'plausible';
    /** The domain registered with the analytics provider. */
    domain: string;
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
  /** Show ad placeholders even when ads are disabled (handy in development). */
  showAdPlaceholders: boolean;
}

export const SITE_CONFIG: SiteConfig = {
  analytics: {
    provider: 'none',
    domain: 'cardhearth.com',
  },
  ads: {
    enabled: false,
    adsenseClient: '',
    inContentSlot: '',
    refreshOnGameEnd: false,
  },
  accounts: {
    enabled: false,
    supabaseUrl: '',
    supabaseAnonKey: '',
  },
  showAdPlaceholders: false,
};
