import FirecrawlApp from '@mendable/firecrawl-js';

interface ErrorResponse {
  success: false;
  error: string;
}

interface ScrapeResponse {
  success: true;
  data: {
    content: string;
    markdown: string;
    html: string;
    metadata: any;
  };
}

type FirecrawlResponse = ScrapeResponse | ErrorResponse;

export class FirecrawlService {
  private static API_KEY_STORAGE_KEY = 'firecrawl_api_key';
  private static firecrawlApp: FirecrawlApp | null = null;
  private static lastRequestTime = 0;
  private static REQUEST_DELAY = 2000; // 2 seconds between requests
  private static coverageCache = new Map<string, 'FTTH' | 'FWA' | 'Non coperto'>();

  static saveApiKey(apiKey: string): void {
    localStorage.setItem(this.API_KEY_STORAGE_KEY, apiKey);
    this.firecrawlApp = new FirecrawlApp({ apiKey });
    console.log('API key saved successfully');
  }

  static getApiKey(): string | null {
    return localStorage.getItem(this.API_KEY_STORAGE_KEY);
  }

  static clearApiKey(): void {
    localStorage.removeItem(this.API_KEY_STORAGE_KEY);
    this.firecrawlApp = null;
  }

  static async testApiKey(apiKey: string): Promise<boolean> {
    try {
      console.log('Testing API key with Firecrawl API');
      const tempApp = new FirecrawlApp({ apiKey });
      // Simple test scrape
      const testResponse = await tempApp.scrapeUrl('https://example.com');
      return testResponse.success;
    } catch (error) {
      console.error('Error testing API key:', error);
      return false;
    }
  }

  private static validateAddress(address: string, city: string): boolean {
    // Check if address is meaningful
    if (!address || address.trim().length < 3) return false;
    if (!city || city.trim().length < 2) return false;
    
    // Remove common empty patterns
    const cleanAddress = address.replace(/[,\s]+/g, ' ').trim();
    if (cleanAddress === '' || cleanAddress === ',') return false;
    
    // Check if address has at least some alphanumeric content
    if (!/[a-zA-Z0-9]/.test(cleanAddress)) return false;
    
    return true;
  }

  private static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async rateLimitedRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.REQUEST_DELAY) {
      const waitTime = this.REQUEST_DELAY - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms before next request`);
      await this.delay(waitTime);
    }
    
    this.lastRequestTime = Date.now();
    return requestFn();
  }

  static async scrapeGoogleMapsAddress(businessName: string, lat: number, lon: number): Promise<{ success: boolean; address?: string; error?: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: 'API key not found' };
    }

    try {
      if (!this.firecrawlApp) {
        this.firecrawlApp = new FirecrawlApp({ apiKey });
      }

      // Costruisci URL Google Maps per il business
      const googleMapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(businessName)}/@${lat},${lon},17z`;
      
      console.log('Scraping Google Maps for address:', { businessName, url: googleMapsUrl });
      
      const scrapeResponse = await this.rateLimitedRequest(async () => {
        return this.firecrawlApp!.scrapeUrl(googleMapsUrl, {
          formats: ['markdown', 'html'],
          waitFor: 3000,
          onlyMainContent: true
        }) as Promise<FirecrawlResponse>;
      });

      if (!scrapeResponse.success) {
        const errorMessage = (scrapeResponse as ErrorResponse).error;
        console.error('Google Maps scrape failed:', errorMessage);
        return { success: false, error: errorMessage || 'Failed to scrape Google Maps' };
      }

      const successResponse = scrapeResponse as ScrapeResponse;
      
      if (!successResponse.data || !successResponse.data.content) {
        return { success: false, error: 'No content received from Google Maps' };
      }

      // Estrai indirizzo dal contenuto
      const content = successResponse.data.content;
      const markdown = successResponse.data.markdown || '';
      
      // Pattern per trovare indirizzi italiani
      const addressPatterns = [
        /indirizzo[:\s]*([^,\n]+,\s*\d{5}\s*[^,\n]+)/i,
        /address[:\s]*([^,\n]+,\s*\d{5}\s*[^,\n]+)/i,
        /([A-Za-z\s]+\d+[^,\n]*,\s*\d{5}\s*[A-Za-z\s]+)/g,
        /via\s+[^,\n]+,\s*\d{5}\s*[^,\n]+/gi,
        /corso\s+[^,\n]+,\s*\d{5}\s*[^,\n]+/gi,
        /piazza\s+[^,\n]+,\s*\d{5}\s*[^,\n]+/gi
      ];

      let extractedAddress = '';
      
      for (const pattern of addressPatterns) {
        const match = content.match(pattern) || markdown.match(pattern);
        if (match) {
          extractedAddress = match[0].replace(/^(indirizzo|address)[:\s]*/i, '').trim();
          break;
        }
      }

      if (extractedAddress) {
        console.log('Address extracted from Google Maps:', extractedAddress);
        return { success: true, address: extractedAddress };
      } else {
        console.log('No address found in Google Maps content');
        return { success: false, error: 'Address not found in Google Maps content' };
      }
    } catch (error) {
      console.error('Error during Google Maps scrape:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to connect to Google Maps' 
      };
    }
  }

  static async scrapeOpenFiberCoverage(city: string, address: string): Promise<{ success: boolean; error?: string; coverage?: 'FTTH' | 'FWA' | 'Non coperto' }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: 'API key not found' };
    }

    // Validate address before attempting scraping
    if (!this.validateAddress(address, city)) {
      console.log('Skipping invalid address:', { address, city });
      return { success: false, error: 'Invalid address format' };
    }

    // Check cache first
    const cacheKey = `${address.trim()}_${city.trim()}`;
    if (this.coverageCache.has(cacheKey)) {
      console.log('Returning cached result for:', cacheKey);
      return { 
        success: true, 
        coverage: this.coverageCache.get(cacheKey)! 
      };
    }

    try {
      if (!this.firecrawlApp) {
        this.firecrawlApp = new FirecrawlApp({ apiKey });
      }

      // Clean and encode the address properly
      const cleanAddress = address.trim();
      const cleanCity = city.trim();
      const fullAddress = `${cleanAddress}, ${cleanCity}`;
      const encodedAddress = encodeURIComponent(fullAddress);
      const openFiberUrl = `https://openfiber.it/verifica-copertura/?address=${encodedAddress}`;
      
      console.log('Scraping Open Fiber coverage for:', { 
        city: cleanCity, 
        address: cleanAddress, 
        fullAddress,
        url: openFiberUrl 
      });
      
      const scrapeResponse = await this.rateLimitedRequest(async () => {
        return this.firecrawlApp!.scrapeUrl(openFiberUrl, {
          formats: ['markdown', 'html'],
          waitFor: 3000,
          onlyMainContent: true
        }) as Promise<FirecrawlResponse>;
      });

      console.log('Scrape response received');

      if (!scrapeResponse.success) {
        const errorMessage = (scrapeResponse as ErrorResponse).error;
        console.error('Scrape failed:', errorMessage);
        
        // If it's a rate limit error, don't cache the failure
        if (errorMessage.includes('429')) {
          return { success: false, error: 'Rate limit exceeded - please wait before trying again' };
        }
        
        return { 
          success: false, 
          error: errorMessage || 'Failed to scrape Open Fiber' 
        };
      }

      const successResponse = scrapeResponse as ScrapeResponse;
      
      if (!successResponse.data || !successResponse.data.content) {
        console.error('Scrape response missing data');
        return { 
          success: false, 
          error: 'No content received from scraping' 
        };
      }

      // Analyze content for coverage
      const content = successResponse.data.content.toLowerCase();
      const markdown = successResponse.data.markdown?.toLowerCase() || '';
      const html = successResponse.data.html?.toLowerCase() || '';
      
      console.log('Analyzing content for coverage indicators');
      
      let coverage: 'FTTH' | 'FWA' | 'Non coperto' = 'Non coperto';
      
      // Look for specific Open Fiber coverage indicators
      const allContent = `${content} ${markdown} ${html}`;
      
      if (allContent.includes('ftth') || 
          allContent.includes('fiber to the home') || 
          allContent.includes('fibra fino a casa') ||
          allContent.includes('disponibile fibra') ||
          allContent.includes('copertura fibra ottica')) {
        coverage = 'FTTH';
      } 
      else if (allContent.includes('fwa') || 
               allContent.includes('fixed wireless access') ||
               allContent.includes('wireless fisso') ||
               allContent.includes('tecnologia wireless')) {
        coverage = 'FWA';
      }
      else if (allContent.includes('non coperto') || 
               allContent.includes('non disponibile') ||
               allContent.includes('not available') ||
               allContent.includes('area non raggiunta')) {
        coverage = 'Non coperto';
      }

      console.log('Coverage detection result:', coverage);
      
      // Cache the result
      this.coverageCache.set(cacheKey, coverage);
      
      return { 
        success: true,
        coverage 
      };
    } catch (error) {
      console.error('Error during Open Fiber scrape:', error);
      
      // If it's a rate limit error, provide specific guidance
      if (error instanceof Error && error.message.includes('429')) {
        return { 
          success: false, 
          error: 'Rate limit exceeded - too many requests. Please wait before searching again.' 
        };
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to connect to Firecrawl API' 
      };
    }
  }

  static async scrapeWebsite(url: string): Promise<{ success: boolean; error?: string; data?: any }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: 'API key not found' };
    }

    try {
      console.log('Making scrape request to Firecrawl API');
      if (!this.firecrawlApp) {
        this.firecrawlApp = new FirecrawlApp({ apiKey });
      }

      const scrapeResponse = await this.firecrawlApp.scrapeUrl(url, {
        formats: ['markdown', 'html'],
      }) as FirecrawlResponse;

      if (!scrapeResponse.success) {
        console.error('Scrape failed:', (scrapeResponse as ErrorResponse).error);
        return { 
          success: false, 
          error: (scrapeResponse as ErrorResponse).error || 'Failed to scrape website' 
        };
      }

      console.log('Scrape successful:', scrapeResponse);
      return { 
        success: true,
        data: scrapeResponse.data 
      };
    } catch (error) {
      console.error('Error during scrape:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to connect to Firecrawl API' 
      };
    }
  }
}
