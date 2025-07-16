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

      // Costruisci l'URL di Open Fiber per la verifica copertura
      const openFiberUrl = `https://openfiber.it/verifica-copertura/`;
      
      console.log('Scraping Open Fiber coverage for:', { city, address });
      
      const scrapeResponse = await this.firecrawlApp.scrapeUrl(openFiberUrl, {
        formats: ['markdown', 'html'],
        waitFor: 2000
      }) as FirecrawlResponse;

      if (!scrapeResponse.success) {
        console.error('Scrape failed:', (scrapeResponse as ErrorResponse).error);
        return { 
          success: false, 
          error: (scrapeResponse as ErrorResponse).error || 'Failed to scrape Open Fiber' 
        };
      }

      // Analizza il contenuto per determinare la copertura
      const content = scrapeResponse.data.content.toLowerCase();
      const markdown = scrapeResponse.data.markdown.toLowerCase();
      
      // Logica di parsing basata sul contenuto della pagina
      let coverage: 'FTTH' | 'FWA' | 'Non coperto' = 'Non coperto';
      
      if (content.includes('ftth') || content.includes('fiber to the home') || markdown.includes('ftth')) {
        coverage = 'FTTH';
      } else if (content.includes('fwa') || content.includes('fixed wireless access') || markdown.includes('fwa')) {
        coverage = 'FWA';
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