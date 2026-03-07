"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Loader2,
  MapPin,
  Search,
  CheckSquare,
  Square,
} from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useData } from "@/context/data-provider";
import { useToast } from "@/hooks/use-toast";

// THE ALIAS DICTIONARY: Translates English names to native database names
const CITY_ALIASES: Record<string, string> = {
  bucharest: "bucuresti",
  vienna: "wien",
  rome: "roma",
  prague: "praha",
  warsaw: "warszawa",
  budapest: "budapest",
  copenhagen: "kobenhavn",
  lisbon: "lisboa",
  athens: "athina",
  brussels: "bruxelles",
  munich: "munchen",
  milan: "milano",
  florence: "firenze",
  naples: "napoli",
};

// PREDEFINED HIGH-VALUE NICHES
const COMMON_KEYWORDS = [
  "Accountants",
  "Financial Advisors",
  "Gyms",
  "Personal Trainers",
  "Dentists",
  "Plumbers",
  "Roofers",
  "Real Estate Agents",
  "Lawyers",
  "Restaurants",
  "Chiropractors",
  "HVAC Services",
  "Landscaping",
  "Electricians",
  "Marketing Agencies",
  "Web Designers",
];

interface AreaGroup {
  admin2: string;
  zipCount: number;
  estCost: number;
}

export function AddMonitorDialog() {
  const supabase = createClientComponentClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);

  const { addMonitor } = useData();
  const { toast } = useToast();

  const [keyword, setKeyword] = useState("");
  const [showKeywordSuggestions, setShowKeywordSuggestions] = useState(false);

  const [cityInput, setCityInput] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  const [foundCityName, setFoundCityName] = useState("");
  const [areas, setAreas] = useState<AreaGroup[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  // Filter keywords based on user input
  const filteredKeywords = COMMON_KEYWORDS.filter((k) =>
    k.toLowerCase().includes(keyword.toLowerCase()),
  );

  // --- NEW: LIVE CITY AUTOCOMPLETE DEBOUNCE ---
  useEffect(() => {
    const fetchCitySuggestions = async () => {
      if (cityInput.trim().length < 2) {
        setCitySuggestions([]);
        return;
      }

      let normalizedSearch = cityInput
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      if (CITY_ALIASES[normalizedSearch]) {
        normalizedSearch = CITY_ALIASES[normalizedSearch];
      }

      // Query database for cities starting with the typed letters
      const { data } = await supabase
        .from("postal_codes")
        .select("city")
        .ilike("city_search", `${normalizedSearch}%`)
        .limit(50); // Pull 50 to ensure we get distinct names

      if (data) {
        // Extract unique city names and limit to top 5 suggestions
        const uniqueCities = Array.from(new Set(data.map((d) => d.city))).slice(
          0,
          5,
        );
        setCitySuggestions(uniqueCities);
      }
    };

    // Wait 300ms after user stops typing before hitting the database
    const timer = setTimeout(() => {
      fetchCitySuggestions();
    }, 300);

    return () => clearTimeout(timer);
  }, [cityInput, supabase]);

  // --- 1. SEARCH CITY ---
  const handleSearchCity = async () => {
    if (!cityInput) return;
    setLoading(true);

    try {
      let normalizedSearch = cityInput
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      if (CITY_ALIASES[normalizedSearch]) {
        normalizedSearch = CITY_ALIASES[normalizedSearch];
      }

      const { data, error } = await supabase
        .from("postal_codes")
        .select("city, admin2, zip_code")
        .ilike("city_search", `%${normalizedSearch}%`);

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          variant: "destructive",
          title: "City Not Found",
          description: "Please check the spelling or try a different city.",
        });
        setLoading(false);
        return;
      }

      setFoundCityName(data[0].city);

      const grouped = data.reduce((acc: Record<string, number>, curr) => {
        const areaName = curr.admin2 || "Main District";
        acc[areaName] = (acc[areaName] || 0) + 1;
        return acc;
      }, {});

      const formattedAreas: AreaGroup[] = Object.entries(grouped).map(
        ([name, count]) => {
          const safeCount = Math.min(count, 50);
          return {
            admin2: name,
            zipCount: safeCount,
            estCost: safeCount * 1,
          };
        },
      );

      setAreas(formattedAreas.sort((a, b) => b.zipCount - a.zipCount));
      setStep(2);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Database Error",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleArea = (areaName: string) => {
    setSelectedAreas((prev) =>
      prev.includes(areaName)
        ? prev.filter((a) => a !== areaName)
        : [...prev, areaName],
    );
  };

  const selectedDetails = areas.filter((a) => selectedAreas.includes(a.admin2));
  const totalCost = selectedDetails.reduce((sum, a) => sum + a.estCost, 0);
  const totalZips = selectedDetails.reduce((sum, a) => sum + a.zipCount, 0);

  const isOverLimit = totalZips > 50;

  const handleSubmit = async () => {
    if (!keyword || selectedAreas.length === 0 || isOverLimit) return;
    setLoading(true);

    try {
      const formattedLocation = `${foundCityName.trim()} | ${selectedAreas.join(", ")}`;

      const result = await addMonitor({
        keyword,
        location: formattedLocation,
        status: "paused",
      });

      if (result.success) {
        toast({
          title: "Scan Started Successfully!",
          description: `We are now scraping ${keyword} in the background. We will email you as soon as your leads are ready!`,
          duration: 9000, // Keeps the message on screen a bit longer so they can read it
        });
        resetState();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "System error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setKeyword("");
    setCityInput("");
    setCitySuggestions([]);
    setFoundCityName("");
    setAreas([]);
    setSelectedAreas([]);
    setShowKeywordSuggestions(false);
    setShowCitySuggestions(false);
    setStep(1);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button className="!bg-[#ffe600] text-black hover:!bg-[#ffe600]/90 font-bold rounded-full px-6 shadow-lg shadow-[#ffe600]/20">
          <Plus size={16} className="mr-2" /> Add Scan
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[450px] rounded-3xl border-zinc-800 bg-[#0b0a0b] text-white">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Target Your Search" : `Targeting: ${foundCityName}`}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {step === 1
              ? "Define the business type and city."
              : `Select multiple districts in ${foundCityName} (Max 50 Zip Codes total).`}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="grid gap-4 py-4">
            {/* KEYWORD INPUT WITH SUGGESTIONS */}
            <div className="grid gap-2 relative">
              <Label>Target Keyword</Label>
              <Input
                placeholder="e.g. Dentists, Gyms, Roofers"
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setShowKeywordSuggestions(true);
                }}
                onFocus={() => setShowKeywordSuggestions(true)}
                onBlur={() =>
                  setTimeout(() => setShowKeywordSuggestions(false), 200)
                }
                className="bg-zinc-900 border-zinc-800 focus-visible:ring-[#ffe600]"
              />

              {showKeywordSuggestions &&
                keyword &&
                filteredKeywords.length > 0 && (
                  <div className="absolute top-[65px] left-0 z-50 w-full bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-h-48 overflow-y-auto overflow-x-hidden">
                    {filteredKeywords.map((kw) => (
                      <div
                        key={kw}
                        className="px-4 py-3 cursor-pointer text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors border-b border-zinc-800/50 last:border-0"
                        onClick={() => {
                          setKeyword(kw);
                          setShowKeywordSuggestions(false);
                        }}
                      >
                        {kw}
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* CITY INPUT WITH LIVE DB SUGGESTIONS */}
            <div className="grid gap-2 relative">
              <Label>City</Label>
              <Input
                placeholder="e.g. London, New York"
                value={cityInput}
                onChange={(e) => {
                  setCityInput(e.target.value);
                  setShowCitySuggestions(true);
                }}
                onFocus={() => setShowCitySuggestions(true)}
                onBlur={() =>
                  setTimeout(() => setShowCitySuggestions(false), 200)
                }
                className="bg-zinc-900 border-zinc-800 focus-visible:ring-[#ffe600]"
              />

              {showCitySuggestions && citySuggestions.length > 0 && (
                <div className="absolute top-[65px] left-0 z-50 w-full bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-h-48 overflow-y-auto overflow-x-hidden">
                  {citySuggestions.map((cityName) => (
                    <div
                      key={cityName}
                      className="px-4 py-3 cursor-pointer text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors border-b border-zinc-800/50 last:border-0"
                      onClick={() => {
                        setCityInput(cityName);
                        setShowCitySuggestions(false);
                      }}
                    >
                      {cityName}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={handleSearchCity}
              disabled={loading || !keyword || !cityInput}
              className="w-full mt-2 !bg-[#ffe600] text-black hover:!bg-[#ffe600]/90 font-bold"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Search size={16} className="mr-2" /> Find Areas
                </>
              )}
            </Button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="grid gap-4 py-2">
            <div className="max-h-[300px] overflow-y-auto pr-2 space-y-3">
              {areas.map((area) => {
                const isSelected = selectedAreas.includes(area.admin2);
                return (
                  <div
                    key={area.admin2}
                    onClick={() => toggleArea(area.admin2)}
                    className={`flex items-center space-x-3 border p-4 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[#ffe600]/10 border-[#ffe600]/50"
                        : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <div className="text-[#ffe600]">
                      {isSelected ? (
                        <CheckSquare size={18} />
                      ) : (
                        <Square size={18} className="text-zinc-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <Label className="text-sm font-bold text-white cursor-pointer block">
                        {area.admin2}
                      </Label>
                      <span className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                        <MapPin size={12} /> {area.zipCount} Postal Codes
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-[#ffe600]">
                        {area.estCost.toLocaleString()} CR
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {isOverLimit && (
              <div className="text-red-400 text-xs text-center font-bold bg-red-500/10 py-2 rounded-lg">
                ⚠️ Too many areas selected ({totalZips}/50 Zip Codes). Please
                deselect some.
              </div>
            )}

            <div className="flex gap-2 mt-2 pt-4 border-t border-zinc-800">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="border-zinc-700 hover:bg-zinc-800 w-1/3"
              >
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || selectedAreas.length === 0 || isOverLimit}
                className="w-2/3 !bg-[#ffe600] text-black hover:!bg-[#ffe600]/90 font-bold"
              >
                {loading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  `Save Target (${totalCost.toLocaleString()} CR)`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
