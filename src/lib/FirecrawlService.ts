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