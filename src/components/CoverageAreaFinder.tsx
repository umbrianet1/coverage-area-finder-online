import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Phone, ExternalLink, Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
}

interface CategoryFilter {
  ricettive: boolean;
  commerciali: boolean;
  industriali: boolean;
}

export default function CoverageAreaFinder() {
  const [lat, setLat] = useState("41.9028");
  const [lon, setLon] = useState("12.4964");
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
  
  const { toast } = useToast();

  // Calculate radio coverage radius based on antenna height
  const calculateRadioCoverage = (h: string) => {
    const height = parseFloat(h);
    if (isNaN(height) || height <= 0) return 0;
    const distanceKm = 3.57 * Math.sqrt(height); // Approximate formula
    return distanceKm * 1000; // Convert to meters
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
      setResults(data.elements || []);
      
      toast({
        title: "Ricerca completata",
        description: `Trovate ${data.elements?.length || 0} attività`,
      });
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
            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lat" className="text-sm font-medium">Latitudine</Label>
                <Input
                  id="lat"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="lon" className="text-sm font-medium">Longitudine</Label>
                <Input
                  id="lon"
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  className="mt-1"
                />
              </div>
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
                            <Badge variant="outline" className="mt-1">
                              {businessInfo.category}
                            </Badge>
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