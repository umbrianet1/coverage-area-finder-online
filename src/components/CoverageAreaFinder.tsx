import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Phone, ExternalLink, Radio, Wifi, Settings, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FirecrawlService } from "@/lib/FirecrawlService";

interface BusinessResult {
  id: number;
  lat: number;
  lon: number;
  tags: {
    name?: string;
    phone?: string;
    "contact:phone"?: string;
    "addr:street"?: string;
    "addr:housenumber"?: string;
    "addr:postcode"?: string;
    "addr:city"?: string;
    amenity?: string;
    shop?: string;
    tourism?: string;
    office?: string;
    landuse?: string;
  };
  fiberCoverage?: 'FTTH' | 'FWA' | 'Non coperto' | 'Verifica in corso...' | 'Errore verifica';
  coverageError?: string;
}

interface CategoryFilter {
  ricettive: boolean;
  commerciali: boolean;
  industriali: boolean;
}

export default function CoverageAreaFinder() {
  const [lat, setLat] = useState("41.9028");
  const [lon, setLon] = useState("12.4964");
  const [coordinates, setCoordinates] = useState("41.9028, 12.4964");
  const [radiusManual, setRadiusManual] = useState("");
  const [height, setHeight] = useState("30");
  const [results, setResults] = useState<BusinessResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRadius, setAutoRadius] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<CategoryFilter>({
    ricettive: true,
    commerciali: true,
    industriali: false,
  });
  
  // Firecrawl API key management
  const [firecrawlApiKey, setFirecrawlApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isApiKeyValid, setIsApiKeyValid] = useState(false);
  const [showApiKeyConfig, setShowApiKeyConfig] = useState(false);
  const [coverageCheckInProgress, setCoverageCheckInProgress] = useState(false);
  
  const { toast } = useToast();

  // Check if API key is saved on component mount
  useEffect(() => {
    const savedApiKey = FirecrawlService.getApiKey();
    if (savedApiKey) {
      setFirecrawlApiKey(savedApiKey);
      setIsApiKeyValid(true);
    } else {
      setShowApiKeyConfig(true);
    }
  }, []);

  const calculateRadioCoverage = (h: string) => {
    const height = parseFloat(h);
    if (isNaN(height) || height <= 0) return 0;
    const distanceKm = 3.57 * Math.sqrt(height);
    return distanceKm * 1000;
  };

  useEffect(() => {
    const calculated = calculateRadioCoverage(height);
    setAutoRadius(calculated);
    if (!radiusManual) {
      setRadiusManual(Math.floor(calculated).toString());
    }
  }, [height, radiusManual]);

  const fetchOSMData = async () => {
    const r = parseInt(radiusManual) || autoRadius;
    setLoading(true);

    let queryParts: string[] = [];

    if (selectedCategories.ricettive) {
      queryParts.push(`node["tourism"="hotel"](around:${r},${lat},${lon});`);
      queryParts.push(`node["tourism"="guest_house"](around:${r},${lat},${lon});`);
      queryParts.push(`node["tourism"="hostel"](around:${r},${lat},${lon});`);
    }

    if (selectedCategories.commerciali) {
      queryParts.push(`node["amenity"="restaurant"](around:${r},${lat},${lon});`);
      queryParts.push(`node["shop"](around:${r},${lat},${lon});`);
      queryParts.push(`node["office"](around:${r},${lat},${lon});`);
    }

    if (selectedCategories.industriali) {
      queryParts.push(`node["landuse"="industrial"](around:${r},${lat},${lon});`);
    }

    if (queryParts.length === 0) {
      toast({
        title: "Nessuna categoria selezionata",
        description: "Seleziona almeno una categoria di attività",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const query = `
[out:json];
(
  ${queryParts.join("\n")}
);
out body qt;`;

    const overpassUrl = "https://overpass-api.de/api/interpreter";

    try {
      const response = await fetch(overpassUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        throw new Error("Errore nella risposta del server");
      }

      const data = await response.json();
      const businesses = data.elements || [];
      setResults(businesses);
      
      toast({
        title: "Ricerca completata",
        description: `Trovate ${businesses.length} attività`,
      });

      if (businesses.length > 0 && isApiKeyValid) {
        checkFiberCoverageForResults(businesses);
      }
    } catch (error) {
      console.error("Errore nel caricamento dei dati:", error);
      toast({
        title: "Errore",
        description: "Impossibile caricare i dati. Riprova più tardi.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: keyof CategoryFilter) => {
    setSelectedCategories({
      ...selectedCategories,
      [category]: !selectedCategories[category],
    });
  };

  const formatAddress = (tags: BusinessResult["tags"]) => {
    const street = tags?.["addr:street"] || "";
    const number = tags?.["addr:housenumber"] || "";
    const postcode = tags?.["addr:postcode"] || "";
    const city = tags?.["addr:city"] || "";
    
    return `${street} ${number}, ${postcode} ${city}`.replace(/\s+/g, " ").trim();
  };

  const getBusinessType = (tags: BusinessResult["tags"]) => {
    if (tags.tourism) return { type: tags.tourism, category: "Ricettivo" };
    if (tags.amenity) return { type: tags.amenity, category: "Servizio" };
    if (tags.shop) return { type: tags.shop, category: "Commercio" };
    if (tags.office) return { type: tags.office, category: "Ufficio" };
    if (tags.landuse) return { type: tags.landuse, category: "Industriale" };
    return { type: "unknown", category: "Altro" };
  };

  const handleApiKeyTest = async () => {
    if (!firecrawlApiKey.trim()) {
      toast({
        title: "Errore",
        description: "Inserisci una chiave API valida",
        variant: "destructive",
      });
      return;
    }

    const isValid = await FirecrawlService.testApiKey(firecrawlApiKey);
    if (isValid) {
      FirecrawlService.saveApiKey(firecrawlApiKey);
      setIsApiKeyValid(true);
      setShowApiKeyConfig(false);
      toast({
        title: "Successo",
        description: "Chiave API validata e salvata",
      });
    } else {
      toast({
        title: "Errore",
        description: "Chiave API non valida",
        variant: "destructive",
      });
    }
  };

  const checkOpenFiberCoverage = async (address: string, city: string): Promise<'FTTH' | 'FWA' | 'Non coperto' | 'Errore verifica' | null> => {
    try {
      if (!isApiKeyValid) {
        console.log('API key not valid, skipping coverage check');
        return null;
      }

      console.log('Checking coverage for:', { address, city });
      const result = await FirecrawlService.scrapeOpenFiberCoverage(city, address);
      
      if (result.success && result.coverage) {
        console.log('Coverage check successful:', result.coverage);
        return result.coverage;
      } else {
        console.error('Errore nel web scraping:', result.error);
        
        // Show user-friendly error message for rate limiting
        if (result.error?.includes('Rate limit') || result.error?.includes('429')) {
          toast({
            title: "Troppi tentativi",
            description: "Attendi qualche secondo prima di verificare nuovamente la copertura",
            variant: "destructive",
          });
        }
        
        return 'Errore verifica';
      }
    } catch (error) {
      console.error('Errore nella verifica copertura fibra:', error);
      return 'Errore verifica';
    }
  };

  const checkFiberCoverageForResults = async (businesses: BusinessResult[]) => {
    setCoverageCheckInProgress(true);
    const updatedResults = [...businesses];
    
    // Show info toast about the process
    toast({
      title: "Verifica copertura fibra",
      description: `Verifica della copertura Open Fiber in corso per ${businesses.length} attività. Questo potrebbe richiedere alcuni minuti.`,
    });
    
    for (let i = 0; i < updatedResults.length; i++) {
      const business = updatedResults[i];
      
      // Skip if no valid address
      const address = formatAddress(business.tags);
      const city = business.tags?.["addr:city"] || "";
      
      if (!address || address.trim().length < 3 || !city) {
        console.log('Skipping business with invalid address:', business.tags?.name);
        continue;
      }
      
      business.fiberCoverage = 'Verifica in corso...';
      setResults([...updatedResults]);
      
      const coverage = await checkOpenFiberCoverage(address, city);
      if (coverage) {
        business.fiberCoverage = coverage;
      } else {
        // Remove coverage field if scraping fails
        delete business.fiberCoverage;
      }
      
      setResults([...updatedResults]);
      
      // Add a small delay to be respectful to the API
      if (i < updatedResults.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    setCoverageCheckInProgress(false);
    
    const successfulChecks = updatedResults.filter(b => 
      b.fiberCoverage && b.fiberCoverage !== 'Verifica in corso...' && b.fiberCoverage !== 'Errore verifica'
    ).length;
    
    toast({
      title: "Verifica completata",
      description: `Copertura verificata per ${successfulChecks} attività`,
    });
  };

  const getFiberBadgeVariant = (coverage?: string) => {
    switch (coverage) {
      case 'FTTH': return 'default';
      case 'FWA': return 'secondary';
      case 'Non coperto': return 'destructive';
      case 'Errore verifica': return 'outline';
      default: return 'outline';
    }
  };

  const getFiberBadgeColor = (coverage?: string) => {
    switch (coverage) {
      case 'FTTH': return 'text-green-700 bg-green-100';
      case 'FWA': return 'text-yellow-700 bg-yellow-100';
      case 'Non coperto': return 'text-red-700 bg-red-100';
      case 'Errore verifica': return 'text-gray-700 bg-gray-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-bg">
      {/* Header */}
      <header className="bg-gradient-primary text-primary-foreground shadow-card">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <Radio className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Coverage Area Finder</h1>
          </div>
          <p className="text-primary-foreground/90 text-lg">
            Analizza la copertura radio e trova attività commerciali nel raggio d'azione
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Control Panel */}
        <Card className="bg-gradient-card shadow-card border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Parametri di Ricerca
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Firecrawl API Configuration */}
            {(showApiKeyConfig || !isApiKeyValid) && (
              <Card className="border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-yellow-600" />
                    <Label className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Configurazione Web Scraping
                    </Label>
                  </div>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    Per verificare la copertura Open Fiber tramite web scraping, è necessaria una chiave API Firecrawl.
                    <br />
                    <span className="font-medium">Importante:</span> Il sistema rispetta i limiti di rate per evitare errori.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="api-key" className="text-sm">Chiave API Firecrawl</Label>
                    <div className="flex gap-2">
                      <Input
                        id="api-key"
                        type={showApiKey ? "text" : "password"}
                        value={firecrawlApiKey}
                        onChange={(e) => setFirecrawlApiKey(e.target.value)}
                        placeholder="fc-xxxxxxxxxxxxx"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={handleApiKeyTest}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      Testa & Salva
                    </Button>
                    {isApiKeyValid && (
                      <Button
                        type="button"
                        onClick={() => setShowApiKeyConfig(false)}
                        variant="outline"
                        size="sm"
                      >
                        Nascondi
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {isApiKeyValid && !showApiKeyConfig && (
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-300">
                    Web scraping attivo {coverageCheckInProgress && "(in corso...)"}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowApiKeyConfig(true)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Warning about rate limiting */}
            {isApiKeyValid && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>Info:</strong> La verifica della copertura avviene con un ritardo di 2 secondi tra le richieste per rispettare i limiti dell'API.
                </div>
              </div>
            )}

            {/* Coordinates */}
            <div>
              <Label htmlFor="coordinates" className="text-sm font-medium">Coordinate (Latitudine, Longitudine)</Label>
              <Input
                id="coordinates"
                value={coordinates}
                onChange={(e) => {
                  setCoordinates(e.target.value);
                  const coords = e.target.value.split(',').map(coord => coord.trim());
                  if (coords.length === 2 && !isNaN(Number(coords[0])) && !isNaN(Number(coords[1]))) {
                    setLat(coords[0]);
                    setLon(coords[1]);
                  }
                }}
                placeholder="es. 41.9028, 12.4964"
                className="mt-1"
              />
            </div>

            {/* Antenna Height */}
            <div>
              <Label htmlFor="height" className="text-sm font-medium">Altezza Antenna (m)</Label>
              <Input
                id="height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Raggio stimato: <span className="font-semibold text-primary">
                  ~{(calculateRadioCoverage(height) / 1000).toFixed(2)} km
                </span>
              </p>
            </div>

            {/* Custom Radius */}
            <div>
              <Label htmlFor="radius" className="text-sm font-medium">Raggio Personalizzato (metri)</Label>
              <Input
                id="radius"
                value={radiusManual}
                onChange={(e) => setRadiusManual(e.target.value)}
                placeholder="Opzionale"
                className="mt-1"
              />
            </div>

            {/* Category Filters */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Tipologie di Attività</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="ricettive"
                    checked={selectedCategories.ricettive}
                    onCheckedChange={() => toggleCategory("ricettive")}
                  />
                  <Label htmlFor="ricettive" className="text-sm cursor-pointer">
                    Strutture Ricettive
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="commerciali"
                    checked={selectedCategories.commerciali}
                    onCheckedChange={() => toggleCategory("commerciali")}
                  />
                  <Label htmlFor="commerciali" className="text-sm cursor-pointer">
                    Attività Commerciali
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="industriali"
                    checked={selectedCategories.industriali}
                    onCheckedChange={() => toggleCategory("industriali")}
                  />
                  <Label htmlFor="industriali" className="text-sm cursor-pointer">
                    Zone Industriali
                  </Label>
                </div>
              </div>
            </div>

            {/* Search Button */}
            <Button
              onClick={fetchOSMData}
              disabled={loading}
              variant="professional"
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ricerca in corso...
                </>
              ) : (
                "Avvia Ricerca"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          <Card className="bg-gradient-card shadow-card border-0 h-[600px] flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Risultati ({results.length})</span>
                {results.length > 0 && (
                  <Badge variant="secondary" className="bg-accent text-accent-foreground">
                    {results.length} attività trovate
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Caricamento dati...</span>
                </div>
              )}
              
              {!loading && results.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nessun risultato trovato.</p>
                  <p className="text-sm">Modifica i parametri di ricerca e riprova.</p>
                </div>
              )}
              
              <div className="space-y-4">
                {results.map((item, index) => {
                  const name = item.tags?.name || "Nome non disponibile";
                  const phone = item.tags?.["contact:phone"] || item.tags?.phone || "";
                  const address = formatAddress(item.tags);
                  const businessInfo = getBusinessType(item.tags);
                  
                  const googleSearchLink = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${address}`)}`;
                  const googleMapsLink = `https://maps.google.com/?q=${encodeURIComponent(`${name} ${address}`)}`;

                  return (
                    <Card key={index} className="border shadow-control hover:shadow-hover transition-smooth">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-foreground">{name}</h3>
                            <div className="flex gap-2 mt-1">
                              <Badge variant="outline">
                                {businessInfo.category}
                              </Badge>
                              {item.fiberCoverage && (
                                <Badge 
                                  variant={getFiberBadgeVariant(item.fiberCoverage)} 
                                  className={`${getFiberBadgeColor(item.fiberCoverage)} border-0`}
                                >
                                  <Wifi className="h-3 w-3 mr-1" />
                                  {item.fiberCoverage === 'Verifica in corso...' ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      Verifica...
                                    </>
                                  ) : item.fiberCoverage === 'Errore verifica' ? (
                                    <>
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      Errore
                                    </>
                                  ) : (
                                    item.fiberCoverage
                                  )}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{address || "Indirizzo non disponibile"}</span>
                          </div>
                          
                          {phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">{phone}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2 mt-4">
                          <Button asChild variant="outline" size="sm">
                            <a href={googleSearchLink} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                              Google
                            </a>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <a href={googleMapsLink} target="_blank" rel="noopener noreferrer">
                              <MapPin className="h-3 w-3" />
                              Maps
                            </a>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
