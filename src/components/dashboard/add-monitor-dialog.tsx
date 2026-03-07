"use client";

import { useState } from "react";
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
  const [cityInput, setCityInput] = useState("");
  const [areas, setAreas] = useState<AreaGroup[]>([]);

  // CHANGED: Now an array to hold multiple selections
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  // --- 1. SEARCH CITY ---
  const handleSearchCity = async () => {
    if (!cityInput) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("postal_codes")
        .select("admin2, zip_code")
        .ilike("city", `%${cityInput.trim()}%`);

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
            // 1 Credit per Zip Code just to run the engine (Max 50 Credits total)
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

  // --- NEW: TOGGLE MULTIPLE AREAS ---
  const toggleArea = (areaName: string) => {
    setSelectedAreas(
      (prev) =>
        prev.includes(areaName)
          ? prev.filter((a) => a !== areaName) // Remove if already selected
          : [...prev, areaName], // Add if not selected
    );
  };

  // --- NEW: DYNAMIC TOTALS ---
  const selectedDetails = areas.filter((a) => selectedAreas.includes(a.admin2));
  const totalCost = selectedDetails.reduce((sum, a) => sum + a.estCost, 0);
  const totalZips = selectedDetails.reduce((sum, a) => sum + a.zipCount, 0);

  // Vercel Timeout Protection
  const isOverLimit = totalZips > 50;

  // --- 2. SAVE THE SCAN ---
  const handleSubmit = async () => {
    if (!keyword || selectedAreas.length === 0 || isOverLimit) return;
    setLoading(true);

    try {
      // Format: "London | Westminster, Camden"
      const formattedLocation = `${cityInput.trim()} | ${selectedAreas.join(", ")}`;

      const result = await addMonitor({
        keyword,
        location: formattedLocation,
        status: "paused",
      });

      if (result.success) {
        toast({
          title: "Scan Created",
          description: `Ready to scan ${keyword} in ${formattedLocation}.`,
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
    setAreas([]);
    setSelectedAreas([]);
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
            {step === 1 ? "Target Your Search" : "Select Search Areas"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {step === 1
              ? "Define the business type and city."
              : `Select multiple districts (Max 50 Zip Codes total).`}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Target Keyword</Label>
              <Input
                placeholder="e.g. Dentists, Gyms, Roofers"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="bg-zinc-900 border-zinc-800 focus-visible:ring-[#ffe600]"
              />
            </div>
            <div className="grid gap-2">
              <Label>City</Label>
              <Input
                placeholder="e.g. London, New York"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                className="bg-zinc-900 border-zinc-800 focus-visible:ring-[#ffe600]"
              />
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

            {/* ERROR WARNING IF OVER LIMIT */}
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
