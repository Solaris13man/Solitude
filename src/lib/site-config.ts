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
  },
  showAdPlaceholders: false,
};
