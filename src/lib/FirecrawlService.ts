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

  static async scrapeOpenFiberCoverage(city: string, address: string): Promise<{ success: boolean; error?: string; coverage?: 'FTTH' | 'FWA' | 'Non coperto' }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: 'API key not found' };
    }

    try {
      if (!this.firecrawlApp) {
        this.firecrawlApp = new FirecrawlApp({ apiKey });
      }

      // Costruisci l'URL di Open Fiber per la verifica copertura con parametri specifici
      const encodedAddress = encodeURIComponent(`${address}, ${city}`);
      const openFiberUrl = `https://openfiber.it/verifica-copertura/?address=${encodedAddress}`;
      
      console.log('Scraping Open Fiber coverage for:', { city, address, url: openFiberUrl });
      
      const scrapeResponse = await this.firecrawlApp.scrapeUrl(openFiberUrl, {
        formats: ['markdown', 'html'],
        waitFor: 3000,
        onlyMainContent: true
      }) as FirecrawlResponse;

      console.log('Scrape response:', scrapeResponse);

      if (!scrapeResponse.success) {
        console.error('Scrape failed:', (scrapeResponse as ErrorResponse).error);
        return { 
          success: false, 
          error: (scrapeResponse as ErrorResponse).error || 'Failed to scrape Open Fiber' 
        };
      }

      const successResponse = scrapeResponse as ScrapeResponse;
      
      // Verifica che la risposta abbia i dati necessari
      if (!successResponse.data || !successResponse.data.content) {
        console.error('Scrape response missing data:', successResponse);
        return { 
          success: false, 
          error: 'No content received from scraping' 
        };
      }

      // Analizza il contenuto per determinare la copertura
      const content = successResponse.data.content.toLowerCase();
      const markdown = successResponse.data.markdown?.toLowerCase() || '';
      const html = successResponse.data.html?.toLowerCase() || '';
      
      console.log('Content to analyze:', { 
        contentLength: content.length, 
        markdownLength: markdown.length,
        htmlLength: html.length
      });
      
      // Logica di parsing più robusta basata sul contenuto della pagina Open Fiber
      let coverage: 'FTTH' | 'FWA' | 'Non coperto' = 'Non coperto';
      
      // Cerca indicatori di FTTH
      if (content.includes('ftth') || 
          content.includes('fiber to the home') || 
          content.includes('fibra ottica') ||
          markdown.includes('ftth') ||
          html.includes('ftth')) {
        coverage = 'FTTH';
      } 
      // Cerca indicatori di FWA
      else if (content.includes('fwa') || 
               content.includes('fixed wireless access') ||
               content.includes('wireless fisso') ||
               markdown.includes('fwa') ||
               html.includes('fwa')) {
        coverage = 'FWA';
      }
      // Cerca indicatori di "non coperto" o "non disponibile"
      else if (content.includes('non coperto') || 
               content.includes('non disponibile') ||
               content.includes('not covered') ||
               markdown.includes('non coperto') ||
               html.includes('non coperto')) {
        coverage = 'Non coperto';
      }

      console.log('Coverage detection result:', coverage);
      return { 
        success: true,
        coverage 
      };
    } catch (error) {
      console.error('Error during Open Fiber scrape:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to connect to Firecrawl API' 
      };
    }
  }

  static async getAddressFromGoogle(businessName: string, lat: number, lon: number): Promise<{ success: boolean; address?: string; error?: string }> {
    try {
      console.log('Getting address from Google for:', { businessName, lat, lon });
      
      // Cerca prima informazioni generali tramite coordinate
      const coordSearchUrl = `https://www.google.com/maps/place/${lat},${lon}`;
      
      // Se abbiamo il nome dell'azienda, cerca direttamente
      const businessSearchUrl = businessName 
        ? `https://www.google.com/maps/search/${encodeURIComponent(businessName)}+${lat},${lon}`
        : coordSearchUrl;
      
      const apiKey = this.getApiKey();
      if (!apiKey) {
        return { success: false, error: 'API key not found' };
      }

      if (!this.firecrawlApp) {
        this.firecrawlApp = new FirecrawlApp({ apiKey });
      }

      const scrapeResponse = await this.firecrawlApp.scrapeUrl(businessSearchUrl, {
        formats: ['markdown'],
        waitFor: 2000,
        onlyMainContent: true
      }) as FirecrawlResponse;

      if (!scrapeResponse.success) {
        console.warn('Google scrape failed, trying coordinate search');
        // Fallback to coordinate search
        const coordResponse = await this.firecrawlApp.scrapeUrl(coordSearchUrl, {
          formats: ['markdown'],
          waitFor: 2000,
          onlyMainContent: true
        }) as FirecrawlResponse;
        
        if (!coordResponse.success) {
          return { 
            success: false, 
            error: (coordResponse as ErrorResponse).error || 'Failed to scrape Google Maps' 
          };
        }
        
        const address = this.extractAddressFromGoogleContent(coordResponse.data.content);
        return { success: true, address };
      }

      const address = this.extractAddressFromGoogleContent(scrapeResponse.data.content);
      return { success: true, address };
    } catch (error) {
      console.error('Error getting address from Google:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get address from Google' 
      };
    }
  }

  private static extractAddressFromGoogleContent(content: string): string {
    if (!content) return '';
    
    // Pattern per trovare indirizzi italiani
    const addressPatterns = [
      // Via/Viale/Piazza + numero civico + CAP + città
      /(?:Via|Viale|Piazza|Corso|Largo|Vicolo|Strada)\s+[^,\n]+,?\s*\d+[A-Za-z]?,?\s*\d{5}\s+[A-Z][a-zA-ZÀ-ÿ\s]+/gi,
      // Numero civico + Via + CAP + città
      /\d+[A-Za-z]?\s+(?:Via|Viale|Piazza|Corso|Largo|Vicolo|Strada)\s+[^,\n]+,?\s*\d{5}\s+[A-Z][a-zA-ZÀ-ÿ\s]+/gi,
      // Pattern più flessibile per indirizzi con virgole
      /(?:Via|Viale|Piazza|Corso|Largo|Vicolo|Strada)[^,\n]+,\s*\d{5}[^,\n]+/gi,
      // Pattern per codici postali seguiti da città
      /\d{5}\s+[A-Z][a-zA-ZÀ-ÿ\s]+(?:,\s*[A-Z]{2})?/g
    ];
    
    for (const pattern of addressPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        // Prendi l'indirizzo più lungo e dettagliato
        const bestMatch = matches.reduce((a, b) => a.length > b.length ? a : b);
        return bestMatch.trim().replace(/\s+/g, ' ');
      }
    }
    
    // Se non trova pattern specifici, cerca linee che contengono numeri civici e CAP
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.match(/\d+[A-Za-z]?.*\d{5}/) && line.length > 10 && line.length < 100) {
        return line.trim().replace(/\s+/g, ' ');
      }
    }
    
    return '';
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